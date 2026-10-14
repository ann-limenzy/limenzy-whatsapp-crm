/**
 * The Limenzy permission policy — spec §161, §162, §162.1 and §163.18.
 *
 * This module is **pure policy**. It is a deterministic function of its inputs,
 * touches no database, reads no request and performs no I/O, so the same inputs
 * always produce the same decision and the rules can be read, tested and
 * reviewed against the specification without a running system.
 *
 * ## What this module decides, and what it does not
 *
 * `evaluatePermission()` answers one narrow question: **may this role perform
 * this kind of action at all, in this workspace?** That is §162, the permission
 * matrix.
 *
 * `evaluateRecordAccess()` answers a different question: **may this user reach
 * this particular Lead or Customer?** That is §162.1, which the specification
 * states is "authoritative for record visibility".
 *
 * The two are deliberately separate, because §162 itself says the matrix rows
 * "define what a user may **do** with a record they can already access". A
 * role permission on its own is never authority over a record, and this module
 * is shaped so that it cannot be mistaken for one.
 *
 * ## What a caller must still do
 *
 * A permitted decision here is **necessary but not sufficient**. Before a
 * server operation proceeds it must also establish, for itself:
 *
 * 1. **Verified membership** — that the actor is an active member of the
 *    workspace, with the role being passed in. Resolve it from the database
 *    through the tenant gateway (`withTenant()` / `withTenantDb()`); never from
 *    anything the browser supplied.
 * 2. **Module availability** — that the module the action belongs to is enabled
 *    for the workspace (§172). This module knows nothing about module gating.
 * 3. **Record scope** — that the specific record is reachable, via
 *    `evaluateRecordAccess()` and the row-level security policies behind it.
 * 4. **The conditions below** — any `PermissionCondition` the decision reports
 *    must be verified against stored data, not asserted by the caller's input.
 *
 * Nothing here is enforcement. §162.1 and §177 require record access to be
 * enforced on the server for every read and every write; hiding a control in
 * the interface is never sufficient. Module gates, record-access enforcement
 * and user management are **not** implemented by the presence of these
 * helpers.
 *
 * ## Inputs are facts, not claims
 *
 * `role`, `managerRecordScope`, `toggles`, `isTeamLeadOfTeamConcerned` and
 * every `PermissionCondition` are **server-verified facts**. A role or a
 * visibility setting that arrived in a request body, a query string, a header
 * or a cookie is a claim, and passing one here would turn this policy into a
 * rubber stamp. Resolve them from the workspace's own records first.
 *
 * ## Fail closed
 *
 * Unknown role, unknown action, an unconfigured workspace toggle, an
 * unconfigured Manager scope, or a condition the caller has not verified all
 * produce a denial. There is no permissive default anywhere in this file.
 */

/**
 * The three roles — spec §161. The set is closed: "V1 does not include custom
 * role creation or field-level permission configuration."
 *
 * **Team Lead is not here.** §161: it "is a responsibility within a Sales Team,
 * not a fourth role… holding it changes neither their role nor their record
 * access". It is modelled as `isTeamLeadOfTeamConcerned` on the input instead.
 *
 * These identifiers match the `workspace_role` database enum exactly.
 */
export const WORKSPACE_ROLES = [
  "owner_admin",
  "manager",
  "staff_sales",
] as const;
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

/**
 * The Manager record scope a workspace configures — spec §162.1.
 *
 * "All Records" means **all CRM records in that one workspace**. It is not
 * cross-workspace authority of any kind: tenant isolation is a separate,
 * independent layer, and no value here ever widens it.
 */
export const MANAGER_RECORD_SCOPES = [
  "all_records",
  "own_assigned_shared",
] as const;
export type ManagerRecordScope = (typeof MANAGER_RECORD_SCOPES)[number];

/**
 * Facts about one record, team or operation that a conditional rule depends on.
 *
 * Each is a question the **server** must answer from stored data before the
 * action runs. The policy reports which ones a decision depends on and refuses
 * unless they are explicitly `true`, so a caller cannot obtain a permission by
 * leaving a condition out.
 */
export const PERMISSION_CONDITIONS = [
  /** The operational item is assigned to the acting user. §162. */
  "assigned_to_actor",
  /** The actor can access both the Lead and the Customer being linked. §162. */
  "can_access_both_records",
  /** The Customer is one the actor is permitted to access. §162, §162.1. */
  "customer_is_permitted",
  /** The record is inside the actor's permitted record scope. §162, §162.1. */
  "record_in_actor_scope",
  /** The team is inside the actor's permitted team scope. §162. */
  "team_in_actor_scope",
  /** Every record using that email address is within permitted scope. §162. */
  "every_record_using_address_in_scope",
  /** Every candidate identity is within permitted scope. §162. */
  "every_candidate_in_scope",
  /** The actor is currently eligible in the team's rotation. §162, §163.5. */
  "eligible_in_team_rotation",
] as const;
export type PermissionCondition = (typeof PERMISSION_CONDITIONS)[number];

/** Why a decision was refused. Every path returns one of these. */
export type DenyReason =
  /** The role is not one of the three in §161. */
  | "unknown_role"
  /** The action is not in the §162 matrix. */
  | "unknown_action"
  /** The matrix says "No" for this role. */
  | "role_denied"
  /** The matrix says "Decision required"; §163.18 denies until approved. */
  | "decision_required"
  /** A "Configurable" cell whose workspace toggle is off. */
  | "toggle_disabled"
  /** A "Configurable" cell whose workspace toggle was never configured. */
  | "toggle_not_configured"
  /** The action needs the Team Lead responsibility for the team concerned. */
  | "not_team_lead"
  /** A required condition was verified as false. */
  | "condition_not_met"
  /** A required condition was not supplied, so it is treated as unverified. */
  | "condition_unverified"
  /** Manager record scope is required but the workspace has not set it. */
  | "manager_scope_not_configured";

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

/**
 * One cell of the §162 matrix.
 *
 * The five shapes are the five things a cell can say. Keeping them distinct —
 * rather than collapsing everything to a boolean — is what lets a conditional
 * permission stay visibly conditional all the way to the call site.
 */
type Rule =
  /** "Yes" — unconditional for this role. */
  | { readonly kind: "allow" }
  /** "No". */
  | { readonly kind: "deny" }
  /** "Decision required (163.18 #n)" — denied until approved. */
  | { readonly kind: "decision_required"; readonly ref: string }
  /** "Configurable" — the workspace decides, optionally within a scope. */
  | {
      readonly kind: "configurable";
      readonly requires: readonly PermissionCondition[];
    }
  /** "Yes, when …" — allowed only where the listed conditions hold. */
  | {
      readonly kind: "conditional";
      readonly requires: readonly PermissionCondition[];
    }
  /** "Team Lead of that team; otherwise …" — the responsibility, not the role. */
  | {
      readonly kind: "team_lead";
      readonly asTeamLead: Rule;
      readonly otherwise: Rule;
    };

const ALLOW: Rule = { kind: "allow" };
const DENY: Rule = { kind: "deny" };
const DECISION = (ref: string): Rule => ({ kind: "decision_required", ref });
const CONFIGURABLE = (...requires: PermissionCondition[]): Rule => ({
  kind: "configurable",
  requires,
});
const WHEN = (...requires: PermissionCondition[]): Rule => ({
  kind: "conditional",
  requires,
});
/** "Team Lead of that team only" — otherwise No. */
const TEAM_LEAD_ONLY: Rule = {
  kind: "team_lead",
  asTeamLead: ALLOW,
  otherwise: DENY,
};
/** "Team Lead of that team; otherwise Decision required". */
const TEAM_LEAD_ELSE = (ref: string): Rule => ({
  kind: "team_lead",
  asTeamLead: ALLOW,
  otherwise: DECISION(ref),
});
/** "No; Team Lead: Decision required" — denied either way, for different reasons. */
const DENIED_TEAM_LEAD_PENDING = (ref: string): Rule => ({
  kind: "team_lead",
  asTeamLead: DECISION(ref),
  otherwise: DENY,
});

type MatrixRow = {
  readonly owner_admin: Rule;
  readonly manager: Rule;
  readonly staff_sales: Rule;
  /** The specification section each rule is taken from. */
  readonly source: string;
};

/**
 * The §162 permission matrix, one entry per row, in the specification's order.
 *
 * Every cell is transcribed from the specification's own wording. Where a cell
 * reads "Configurable", the workspace toggle governs; where it reads "Decision
 * required", §163.18 denies it until the client approves it, and it "must never
 * be assumed".
 */
const MATRIX = {
  view_all_leads_customers: {
    owner_admin: ALLOW,
    manager: CONFIGURABLE(),
    staff_sales: DENY,
    source: "§162",
  },
  add_leads_customers: {
    owner_admin: ALLOW,
    manager: ALLOW,
    staff_sales: CONFIGURABLE(),
    source: "§162",
  },
  edit_permitted_records: {
    owner_admin: ALLOW,
    manager: ALLOW,
    staff_sales: ALLOW,
    source: "§162",
  },
  change_record_owner: {
    owner_admin: ALLOW,
    manager: CONFIGURABLE(),
    staff_sales: DENY,
    source: "§162",
  },
  reassign_follow_ups_renewals: {
    owner_admin: ALLOW,
    manager: CONFIGURABLE(),
    staff_sales: DENY,
    source: "§162",
  },
  send_individual_whatsapp_messages: {
    owner_admin: ALLOW,
    manager: ALLOW,
    staff_sales: ALLOW,
    source: "§162",
  },
  assign_whatsapp_conversations: {
    owner_admin: ALLOW,
    manager: CONFIGURABLE(),
    staff_sales: DENY,
    source: "§162",
  },
  send_bulk_whatsapp_messages: {
    owner_admin: ALLOW,
    manager: CONFIGURABLE(),
    staff_sales: DENY,
    source: "§162",
  },
  import_export: {
    owner_admin: ALLOW,
    manager: CONFIGURABLE(),
    staff_sales: DENY,
    source: "§162",
  },
  view_reports: {
    owner_admin: ALLOW,
    manager: ALLOW,
    staff_sales: DENY,
    source: "§162",
  },
  manage_users: {
    owner_admin: ALLOW,
    manager: DENY,
    staff_sales: DENY,
    source: "§162, §159",
  },
  configure_crm_settings: {
    owner_admin: ALLOW,
    manager: DENY,
    staff_sales: DENY,
    source: "§162",
  },
  send_individual_emails: {
    owner_admin: ALLOW,
    manager: ALLOW,
    staff_sales: ALLOW,
    source: "§162",
  },
  send_manual_email_reminders: {
    owner_admin: ALLOW,
    manager: ALLOW,
    staff_sales: CONFIGURABLE(),
    source: "§162",
  },
  send_controlled_bulk_email_reminders: {
    owner_admin: ALLOW,
    manager: CONFIGURABLE(),
    staff_sales: DENY,
    source: "§162",
  },
  manage_email_templates: {
    owner_admin: ALLOW,
    manager: DENY,
    staff_sales: DENY,
    source: "§162",
  },
  configure_email_sender: {
    owner_admin: ALLOW,
    manager: DENY,
    staff_sales: DENY,
    source: "§162",
  },

  // Sales Teams — §162 rows, with §163.18 governing every "Decision required".
  view_own_sales_team_and_team_lead: {
    owner_admin: ALLOW,
    manager: ALLOW,
    staff_sales: ALLOW,
    source: "§162",
  },
  view_other_sales_teams: {
    owner_admin: ALLOW,
    manager: DECISION("163.18 #5"),
    staff_sales: DENY,
    source: "§162, §163.18",
  },
  manage_sales_teams: {
    owner_admin: ALLOW,
    manager: DECISION("163.18 #5"),
    staff_sales: DENY,
    source: "§162, §163.18",
  },
  manage_team_members: {
    owner_admin: ALLOW,
    manager: DECISION("163.18 #5"),
    staff_sales: DENY,
    source: "§162, §163.18",
  },
  designate_or_replace_team_lead: {
    owner_admin: ALLOW,
    manager: DECISION("163.18 #5"),
    staff_sales: DENY,
    source: "§162, §163.3, §163.18",
  },
  access_settings_sales_teams: {
    owner_admin: ALLOW,
    manager: DECISION("163.18 #5"),
    staff_sales: DENY,
    source: "§162, §163.18",
  },
  view_lead_assignment_eligibility: {
    owner_admin: ALLOW,
    manager: TEAM_LEAD_ELSE("163.18 #5"),
    staff_sales: TEAM_LEAD_ONLY,
    source: "§162, §163.5",
  },
  view_own_team_minimum_roster: {
    owner_admin: ALLOW,
    manager: TEAM_LEAD_ELSE("163.18 #5"),
    staff_sales: TEAM_LEAD_ONLY,
    source: "§162, §163.6",
  },
  receive_leads_from_own_team_rotation: {
    // "Team Lead of that team; otherwise as permitted" for both Owner/Admin and
    // Manager; "Yes" for Staff/Sales. The row is titled "while eligible", so
    // eligibility is required of every role. See the ambiguity note in the
    // completion report for "as permitted".
    owner_admin: WHEN("eligible_in_team_rotation"),
    manager: WHEN("eligible_in_team_rotation"),
    staff_sales: WHEN("eligible_in_team_rotation"),
    source: "§162, §163.5",
  },
  change_own_lead_assignment_eligibility: {
    owner_admin: ALLOW,
    manager: TEAM_LEAD_ONLY,
    staff_sales: TEAM_LEAD_ONLY,
    source: "§162, §163.5",
  },
  change_own_team_members_lead_assignment_eligibility: {
    owner_admin: ALLOW,
    manager: TEAM_LEAD_ONLY,
    staff_sales: TEAM_LEAD_ONLY,
    source: "§162, §163.6",
  },
  override_lead_assignment_eligibility: {
    owner_admin: ALLOW,
    manager: DENY,
    staff_sales: DENY,
    source: "§162, §163.5",
  },
  configure_lead_assignment_rules: {
    owner_admin: ALLOW,
    manager: DECISION("163.18 #5"),
    staff_sales: DENY,
    source: "§162, §163.18",
  },
  view_own_team_eligible_pool: {
    owner_admin: ALLOW,
    manager: TEAM_LEAD_ELSE("163.18 #5"),
    staff_sales: TEAM_LEAD_ONLY,
    source: "§162, §163.6",
  },
  preview_rotation_state: {
    owner_admin: ALLOW,
    manager: DECISION("163.18 #5"),
    staff_sales: DENIED_TEAM_LEAD_PENDING("163.18 #3"),
    source: "§162, §163.18",
  },
  view_own_team_assignment_required_warning: {
    owner_admin: ALLOW,
    manager: TEAM_LEAD_ELSE("163.18 #5"),
    staff_sales: TEAM_LEAD_ONLY,
    source: "§162, §163.6",
  },
  view_assignment_failures_any_team: {
    owner_admin: ALLOW,
    manager: DECISION("163.18 #5"),
    staff_sales: DENY,
    source: "§162, §163.18",
  },
  manually_assign_leads_within_team: {
    owner_admin: ALLOW,
    manager: CONFIGURABLE(),
    staff_sales: DENIED_TEAM_LEAD_PENDING("163.18 #4"),
    source: "§162, §163.10",
  },
  manually_assign_leads_across_teams: {
    owner_admin: ALLOW,
    manager: DECISION("163.18 #5"),
    staff_sales: DENY,
    source: "§162, §163.18",
  },
  view_assignment_audit_history: {
    owner_admin: ALLOW,
    manager: DECISION("163.18 #5"),
    staff_sales: DENIED_TEAM_LEAD_PENDING("163.18 #3"),
    source: "§162, §163.13, §163.18",
  },
  view_own_team_workload: {
    owner_admin: ALLOW,
    manager: DECISION("163.18 #5"),
    staff_sales: DENIED_TEAM_LEAD_PENDING("163.18 #3"),
    source: "§162, §163.18",
  },
  view_other_teams_workload: {
    owner_admin: ALLOW,
    manager: DECISION("163.18 #5"),
    staff_sales: DENY,
    source: "§162, §163.18",
  },

  // Follow-ups and Renewals — §162 rows.
  create_follow_up_on_accessible_record: {
    owner_admin: ALLOW,
    manager: ALLOW,
    staff_sales: ALLOW,
    source: "§162",
  },
  complete_or_reschedule_assigned_follow_up: {
    owner_admin: ALLOW,
    manager: ALLOW,
    staff_sales: ALLOW,
    source: "§162",
  },
  schedule_next_follow_up_on_completion: {
    owner_admin: ALLOW,
    manager: ALLOW,
    staff_sales: ALLOW,
    source: "§162",
  },
  complete_renewal_or_set_next_due_date: {
    owner_admin: ALLOW,
    manager: ALLOW,
    staff_sales: WHEN("assigned_to_actor"),
    source: "§162",
  },
  send_individual_renewal_reminder: {
    owner_admin: ALLOW,
    manager: ALLOW,
    staff_sales: WHEN("assigned_to_actor"),
    source: "§162",
  },
  retry_failed_reminder_they_sent: {
    owner_admin: ALLOW,
    manager: ALLOW,
    staff_sales: ALLOW,
    source: "§162",
  },
  change_workspace_reminder_defaults: {
    owner_admin: ALLOW,
    manager: DENY,
    staff_sales: DENY,
    source: "§162",
  },

  // WhatsApp — §162 rows. Note §162.1: conversation assignment grants no
  // access to the related Lead or Customer.
  view_assigned_whatsapp_conversation: {
    owner_admin: ALLOW,
    manager: CONFIGURABLE(),
    staff_sales: WHEN("assigned_to_actor"),
    source: "§162, §162.1",
  },
  close_or_reopen_whatsapp_conversation: {
    owner_admin: ALLOW,
    manager: ALLOW,
    staff_sales: WHEN("assigned_to_actor"),
    source: "§162",
  },
  add_conversation_note_or_follow_up_from_conversation: {
    owner_admin: ALLOW,
    manager: ALLOW,
    staff_sales: WHEN("assigned_to_actor"),
    source: "§162",
  },
  mark_contact_whatsapp_opted_out: {
    owner_admin: ALLOW,
    manager: ALLOW,
    staff_sales: ALLOW,
    source: "§162",
  },
  remove_whatsapp_opt_out: {
    owner_admin: ALLOW,
    manager: ALLOW,
    staff_sales: DENY,
    source: "§162",
  },
  manage_whatsapp_templates: {
    owner_admin: ALLOW,
    manager: DENY,
    staff_sales: DENY,
    source: "§162",
  },

  // Email opt-out — §162 rows.
  mark_record_email_opted_out: {
    owner_admin: ALLOW,
    manager: ALLOW,
    staff_sales: ALLOW,
    source: "§162",
  },
  remove_email_opt_out: {
    owner_admin: ALLOW,
    manager: ALLOW,
    staff_sales: DENY,
    source: "§162",
  },

  // Records — §162 rows.
  convert_accessible_lead_they_own: {
    owner_admin: ALLOW,
    manager: ALLOW,
    staff_sales: ALLOW,
    source: "§162",
  },
  link_lead_to_existing_accessible_customer: {
    owner_admin: ALLOW,
    manager: ALLOW,
    staff_sales: WHEN("can_access_both_records"),
    source: "§162, §162.1",
  },
  archive_or_restore_lead: {
    owner_admin: ALLOW,
    manager: CONFIGURABLE(),
    staff_sales: DENY,
    source: "§162",
  },
  archive_or_restore_customer: {
    owner_admin: ALLOW,
    manager: CONFIGURABLE(),
    staff_sales: DENY,
    source: "§162",
  },
  upload_view_download_customer_document: {
    owner_admin: ALLOW,
    manager: ALLOW,
    staff_sales: WHEN("customer_is_permitted"),
    source: "§162, §162.1",
  },
  archive_or_restore_customer_document: {
    owner_admin: ALLOW,
    manager: ALLOW,
    staff_sales: DENY,
    source: "§162",
  },
  create_anyway_after_duplicate_warning: {
    owner_admin: ALLOW,
    manager: ALLOW,
    staff_sales: DENY,
    source: "§162",
  },
  grant_or_revoke_explicit_record_share: {
    // §162.1: Staff/Sales users and ordinary Record Owners must NOT be able to
    // grant or revoke access merely because they own the record.
    owner_admin: ALLOW,
    manager: CONFIGURABLE("record_in_actor_scope"),
    staff_sales: DENY,
    source: "§162, §162.1",
  },

  // Assignment Required and identity resolution — §162 rows.
  manually_resolve_lead_in_assignment_required: {
    owner_admin: ALLOW,
    manager: CONFIGURABLE("record_in_actor_scope", "team_in_actor_scope"),
    staff_sales: DENIED_TEAM_LEAD_PENDING("163.18 #4"),
    source: "§162, §163.9",
  },
  retry_automatic_assignment_for_waiting_lead: {
    owner_admin: ALLOW,
    manager: CONFIGURABLE("record_in_actor_scope", "team_in_actor_scope"),
    staff_sales: DENIED_TEAM_LEAD_PENDING("163.18 #4"),
    source: "§162, §163.9",
  },
  bulk_reprocess_leads_in_assignment_required: {
    owner_admin: ALLOW,
    manager: CONFIGURABLE("record_in_actor_scope", "team_in_actor_scope"),
    staff_sales: DENIED_TEAM_LEAD_PENDING("163.18 #4"),
    source: "§162, §163.9",
  },
  clear_undeliverable_email_address: {
    owner_admin: ALLOW,
    manager: CONFIGURABLE("every_record_using_address_in_scope"),
    staff_sales: DENY,
    source: "§162",
  },
  resolve_ambiguous_whatsapp_conversation_identity: {
    owner_admin: ALLOW,
    manager: CONFIGURABLE("every_candidate_in_scope"),
    staff_sales: DENY,
    source: "§162",
  },
} as const satisfies Record<string, MatrixRow>;

/** Every action in the §162 matrix. */
export type PermissionAction = keyof typeof MATRIX;

/** The action identifiers, for exhaustive iteration in tests and tooling. */
export const PERMISSION_ACTIONS = Object.keys(
  MATRIX,
) as readonly PermissionAction[];

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

export type PermissionInput = {
  /** The actor's verified role in the workspace. Never a browser claim. */
  readonly role: WorkspaceRole;
  /** The action being attempted. */
  readonly action: PermissionAction;
  /**
   * Workspace settings for "Configurable" cells, keyed by action.
   *
   * A missing entry is **not** a default-on: it denies with
   * `toggle_not_configured`, because the specification leaves the choice to the
   * workspace and an unmade choice is not a grant.
   */
  readonly toggles?: Partial<Record<PermissionAction, boolean>>;
  /**
   * Whether the actor currently holds the Team Lead responsibility **for the
   * team this action concerns** — §163.3. Not a role, and never transferable
   * to another team (§162, §163.5).
   */
  readonly isTeamLeadOfTeamConcerned?: boolean;
  /** Server-verified facts for conditional rules. Absent means unverified. */
  readonly conditions?: Partial<Record<PermissionCondition, boolean>>;
};

export type PermissionDecision =
  | {
      readonly allowed: true;
      /**
       * The conditions that had to hold, and were verified, for this decision.
       * Empty for an unconditional "Yes".
       */
      readonly satisfied: readonly PermissionCondition[];
      /** The specification section this rule came from. */
      readonly source: string;
    }
  | {
      readonly allowed: false;
      readonly reason: DenyReason;
      /** The condition that failed, where the reason concerns one. */
      readonly condition?: PermissionCondition;
      /** The §163.18 decision reference, where the reason is a pending one. */
      readonly ref?: string;
      /** The specification section, where the action was recognised. */
      readonly source?: string;
    };

const isWorkspaceRole = (value: unknown): value is WorkspaceRole =>
  typeof value === "string" &&
  (WORKSPACE_ROLES as readonly string[]).includes(value);

const isPermissionAction = (value: unknown): value is PermissionAction =>
  typeof value === "string" &&
  Object.prototype.hasOwnProperty.call(MATRIX, value);

/**
 * Decide whether a role may perform an action — §162.
 *
 * This is **not** record access. A `true` here means the role is permitted this
 * kind of action in principle; the caller must still establish verified
 * membership, module availability and record scope. See the module header.
 */
export function evaluatePermission(input: PermissionInput): PermissionDecision {
  if (!isWorkspaceRole(input?.role))
    return { allowed: false, reason: "unknown_role" };
  if (!isPermissionAction(input?.action))
    return { allowed: false, reason: "unknown_action" };

  const row: MatrixRow = MATRIX[input.action];
  return resolve(row[input.role], input, row.source);
}

function resolve(
  rule: Rule,
  input: PermissionInput,
  source: string,
): PermissionDecision {
  switch (rule.kind) {
    case "allow":
      return { allowed: true, satisfied: [], source };

    case "deny":
      return { allowed: false, reason: "role_denied", source };

    case "decision_required":
      // §163.18 least privilege: "it must never be assumed, and it is denied
      // until approved".
      return {
        allowed: false,
        reason: "decision_required",
        ref: rule.ref,
        source,
      };

    case "configurable": {
      const enabled = input.toggles?.[input.action];
      if (enabled === undefined)
        return { allowed: false, reason: "toggle_not_configured", source };
      if (enabled !== true)
        return { allowed: false, reason: "toggle_disabled", source };
      return checkConditions(rule.requires, input, source);
    }

    case "conditional":
      return checkConditions(rule.requires, input, source);

    case "team_lead":
      // The responsibility, for the team concerned — never the role, and never
      // another team (§161, §162, §163.5).
      return input.isTeamLeadOfTeamConcerned === true
        ? resolve(rule.asTeamLead, input, source)
        : resolve(rule.otherwise, input, source);
  }
}

function checkConditions(
  requires: readonly PermissionCondition[],
  input: PermissionInput,
  source: string,
): PermissionDecision {
  for (const condition of requires) {
    const value = input.conditions?.[condition];
    if (value === undefined)
      return {
        allowed: false,
        reason: "condition_unverified",
        condition,
        source,
      };
    if (value !== true)
      return { allowed: false, reason: "condition_not_met", condition, source };
  }
  return { allowed: true, satisfied: requires, source };
}

/** Convenience boolean for call sites that do not need the reason. */
export function can(input: PermissionInput): boolean {
  return evaluatePermission(input).allowed;
}

/**
 * The conditions an action depends on for a role, before any are supplied.
 *
 * Lets a caller discover what it must verify, rather than discovering it by
 * being denied. Returns an empty list for unconditional, denied and pending
 * cells alike — it describes conditions, not permission.
 */
export function requiredConditions(
  role: WorkspaceRole,
  action: PermissionAction,
  options?: { readonly isTeamLeadOfTeamConcerned?: boolean },
): readonly PermissionCondition[] {
  if (!isWorkspaceRole(role) || !isPermissionAction(action)) return [];
  let rule: Rule = MATRIX[action][role];
  while (rule.kind === "team_lead") {
    rule =
      options?.isTeamLeadOfTeamConcerned === true
        ? rule.asTeamLead
        : rule.otherwise;
  }
  return rule.kind === "configurable" || rule.kind === "conditional"
    ? rule.requires
    : [];
}

// ---------------------------------------------------------------------------
// Record access — §162.1
// ---------------------------------------------------------------------------

/**
 * What the server has established about one Lead or Customer and this actor.
 *
 * Every field is a verified fact about stored data. §162.1 is explicit that
 * "Sales Team membership alone grants **no** access", and that "WhatsApp
 * conversation assignment grants **no** access to the related Lead or
 * Customer" — so team membership and conversation assignment are deliberately
 * **not** inputs here. There is no field through which they could leak in.
 *
 * This module does not define how ownership, assignment or sharing are stored.
 * It takes the answers; §162.1 describes the required information and the
 * database design belongs to its own milestone.
 */
export type RecordRelationship = {
  /** The actor is the Record Owner. §162.1. */
  readonly isOwner?: boolean;
  /** An operational item on this record is assigned to the actor. §162.1. */
  readonly isAssigned?: boolean;
  /**
   * The related-record permission has been validated for that assignment —
   * §162.1 requires this before an operational assignment confers access, so
   * that "operational assignment is never used as a hidden record-sharing
   * mechanism".
   */
  readonly relatedRecordPermissionValidated?: boolean;
  /** A current, unrevoked explicit record share names the actor. §162.1. */
  readonly isExplicitlyShared?: boolean;
};

export type RecordAccessInput = {
  /** The actor's verified role in the workspace. */
  readonly role: WorkspaceRole;
  /**
   * The workspace's configured Manager record scope. Required for Managers;
   * an unset value denies rather than assuming either setting.
   */
  readonly managerRecordScope?: ManagerRecordScope;
  readonly relationship?: RecordRelationship;
};

export type RecordAccessDecision =
  | {
      readonly allowed: true;
      readonly basis: RecordAccessBasis;
      readonly source: string;
    }
  | {
      readonly allowed: false;
      readonly reason: DenyReason | "no_qualifying_relationship";
      readonly source?: string;
    };

/** Why access was granted — useful for audit, never for widening. */
export type RecordAccessBasis =
  /** Owner/Admin: all CRM records in **their workspace**. §162.1. */
  | "role_owner_admin"
  /** Manager with the workspace scope set to All Records. §162.1. */
  | "manager_all_records"
  | "owner"
  | "validated_assignment"
  | "explicit_share";

/**
 * Decide whether an actor may access one Lead or Customer — §162.1.
 *
 * §162.1 is "authoritative for record visibility". A §162 permission never
 * substitutes for this, and this never substitutes for the row-level security
 * policies: both layers apply, and neither replaces the other.
 */
export function evaluateRecordAccess(
  input: RecordAccessInput,
): RecordAccessDecision {
  const source = "§162.1";
  if (!isWorkspaceRole(input?.role))
    return { allowed: false, reason: "unknown_role" };

  const rel = input.relationship ?? {};
  const owns = rel.isOwner === true;
  const shared = rel.isExplicitlyShared === true;
  /**
   * §162.1: assignment confers access only "where the related-record
   * permission has been validated". Assignment alone is never enough.
   */
  const validlyAssigned =
    rel.isAssigned === true && rel.relatedRecordPermissionValidated === true;

  if (input.role === "owner_admin")
    return { allowed: true, basis: "role_owner_admin", source };

  if (input.role === "manager") {
    if (input.managerRecordScope === undefined)
      return { allowed: false, reason: "manager_scope_not_configured", source };
    // "All Records" is all records in THIS workspace — never another's.
    if (input.managerRecordScope === "all_records")
      return { allowed: true, basis: "manager_all_records", source };
    if (input.managerRecordScope !== "own_assigned_shared")
      return { allowed: false, reason: "manager_scope_not_configured", source };
  }

  // Staff/Sales, and Managers scoped to Own, Assigned and Explicitly Shared.
  if (owns) return { allowed: true, basis: "owner", source };
  if (validlyAssigned)
    return { allowed: true, basis: "validated_assignment", source };
  if (shared) return { allowed: true, basis: "explicit_share", source };
  return { allowed: false, reason: "no_qualifying_relationship", source };
}
