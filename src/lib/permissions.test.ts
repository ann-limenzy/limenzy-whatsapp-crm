import { describe, expect, it } from "vitest";

import {
  MANAGER_RECORD_SCOPES,
  PERMISSION_ACTIONS,
  WORKSPACE_ROLES,
  can,
  evaluatePermission,
  evaluateRecordAccess,
  requiredConditions,
  type PermissionAction,
  type PermissionCondition,
  type WorkspaceRole,
} from "./permissions";

/**
 * The permission policy, checked against the specification.
 *
 * **The expectations below are transcribed from spec §162, not derived from
 * the implementation.** `SPEC` is a hand-written reading of the matrix: the
 * cell wording for each row, written out independently. The tests then assert
 * that `evaluatePermission()` behaves the way that wording requires. If the
 * implementation and this table ever disagree, one of them is wrong about the
 * specification — which is the point of writing it twice.
 */

/** A cell of §162, as the specification words it. */
type Cell =
  | { k: "yes" }
  | { k: "no" }
  | { k: "configurable"; needs?: readonly PermissionCondition[] }
  | { k: "decision" }
  /** "Team Lead of that team only" — otherwise No. */
  | { k: "team_lead_only" }
  /** "Team Lead of that team; otherwise Decision required". */
  | { k: "team_lead_else_decision" }
  /** "No; Team Lead: Decision required" — denied either way. */
  | { k: "no_team_lead_pending" }
  /** "Yes, when …" */
  | { k: "when"; needs: readonly PermissionCondition[] };

const YES: Cell = { k: "yes" };
const NO: Cell = { k: "no" };
const CFG = (...needs: PermissionCondition[]): Cell => ({
  k: "configurable",
  needs,
});
const DEC: Cell = { k: "decision" };
const TL_ONLY: Cell = { k: "team_lead_only" };
const TL_ELSE_DEC: Cell = { k: "team_lead_else_decision" };
const NO_TL_PENDING: Cell = { k: "no_team_lead_pending" };
const WHEN = (...needs: PermissionCondition[]): Cell => ({ k: "when", needs });

/** §162, in the specification's own order: Owner/Admin, Manager, Staff/Sales. */
const SPEC: Record<PermissionAction, readonly [Cell, Cell, Cell]> = {
  view_all_leads_customers: [YES, CFG(), NO],
  add_leads_customers: [YES, YES, CFG()],
  edit_permitted_records: [YES, YES, YES],
  change_record_owner: [YES, CFG(), NO],
  reassign_follow_ups_renewals: [YES, CFG(), NO],
  send_individual_whatsapp_messages: [YES, YES, YES],
  assign_whatsapp_conversations: [YES, CFG(), NO],
  send_bulk_whatsapp_messages: [YES, CFG(), NO],
  import_export: [YES, CFG(), NO],
  view_reports: [YES, YES, NO],
  manage_users: [YES, NO, NO],
  configure_crm_settings: [YES, NO, NO],
  send_individual_emails: [YES, YES, YES],
  send_manual_email_reminders: [YES, YES, CFG()],
  send_controlled_bulk_email_reminders: [YES, CFG(), NO],
  manage_email_templates: [YES, NO, NO],
  configure_email_sender: [YES, NO, NO],
  view_own_sales_team_and_team_lead: [YES, YES, YES],
  view_other_sales_teams: [YES, DEC, NO],
  manage_sales_teams: [YES, DEC, NO],
  manage_team_members: [YES, DEC, NO],
  designate_or_replace_team_lead: [YES, DEC, NO],
  access_settings_sales_teams: [YES, DEC, NO],
  view_lead_assignment_eligibility: [YES, TL_ELSE_DEC, TL_ONLY],
  view_own_team_minimum_roster: [YES, TL_ELSE_DEC, TL_ONLY],
  receive_leads_from_own_team_rotation: [
    WHEN("eligible_in_team_rotation"),
    WHEN("eligible_in_team_rotation"),
    WHEN("eligible_in_team_rotation"),
  ],
  change_own_lead_assignment_eligibility: [YES, TL_ONLY, TL_ONLY],
  change_own_team_members_lead_assignment_eligibility: [YES, TL_ONLY, TL_ONLY],
  override_lead_assignment_eligibility: [YES, NO, NO],
  configure_lead_assignment_rules: [YES, DEC, NO],
  view_own_team_eligible_pool: [YES, TL_ELSE_DEC, TL_ONLY],
  preview_rotation_state: [YES, DEC, NO_TL_PENDING],
  view_own_team_assignment_required_warning: [YES, TL_ELSE_DEC, TL_ONLY],
  view_assignment_failures_any_team: [YES, DEC, NO],
  manually_assign_leads_within_team: [YES, CFG(), NO_TL_PENDING],
  manually_assign_leads_across_teams: [YES, DEC, NO],
  view_assignment_audit_history: [YES, DEC, NO_TL_PENDING],
  view_own_team_workload: [YES, DEC, NO_TL_PENDING],
  view_other_teams_workload: [YES, DEC, NO],
  create_follow_up_on_accessible_record: [YES, YES, YES],
  complete_or_reschedule_assigned_follow_up: [YES, YES, YES],
  schedule_next_follow_up_on_completion: [YES, YES, YES],
  complete_renewal_or_set_next_due_date: [YES, YES, WHEN("assigned_to_actor")],
  send_individual_renewal_reminder: [YES, YES, WHEN("assigned_to_actor")],
  retry_failed_reminder_they_sent: [YES, YES, YES],
  change_workspace_reminder_defaults: [YES, NO, NO],
  view_assigned_whatsapp_conversation: [YES, CFG(), WHEN("assigned_to_actor")],
  close_or_reopen_whatsapp_conversation: [YES, YES, WHEN("assigned_to_actor")],
  add_conversation_note_or_follow_up_from_conversation: [
    YES,
    YES,
    WHEN("assigned_to_actor"),
  ],
  mark_contact_whatsapp_opted_out: [YES, YES, YES],
  remove_whatsapp_opt_out: [YES, YES, NO],
  manage_whatsapp_templates: [YES, NO, NO],
  mark_record_email_opted_out: [YES, YES, YES],
  remove_email_opt_out: [YES, YES, NO],
  convert_accessible_lead_they_own: [YES, YES, YES],
  link_lead_to_existing_accessible_customer: [
    YES,
    YES,
    WHEN("can_access_both_records"),
  ],
  archive_or_restore_lead: [YES, CFG(), NO],
  archive_or_restore_customer: [YES, CFG(), NO],
  upload_view_download_customer_document: [
    YES,
    YES,
    WHEN("customer_is_permitted"),
  ],
  archive_or_restore_customer_document: [YES, YES, NO],
  create_anyway_after_duplicate_warning: [YES, YES, NO],
  grant_or_revoke_explicit_record_share: [
    YES,
    CFG("record_in_actor_scope"),
    NO,
  ],
  manually_resolve_lead_in_assignment_required: [
    YES,
    CFG("record_in_actor_scope", "team_in_actor_scope"),
    NO_TL_PENDING,
  ],
  retry_automatic_assignment_for_waiting_lead: [
    YES,
    CFG("record_in_actor_scope", "team_in_actor_scope"),
    NO_TL_PENDING,
  ],
  bulk_reprocess_leads_in_assignment_required: [
    YES,
    CFG("record_in_actor_scope", "team_in_actor_scope"),
    NO_TL_PENDING,
  ],
  clear_undeliverable_email_address: [
    YES,
    CFG("every_record_using_address_in_scope"),
    NO,
  ],
  resolve_ambiguous_whatsapp_conversation_identity: [
    YES,
    CFG("every_candidate_in_scope"),
    NO,
  ],
};

const ROLE_INDEX: Record<WorkspaceRole, 0 | 1 | 2> = {
  owner_admin: 0,
  manager: 1,
  staff_sales: 2,
};

const allTrue = (needs: readonly PermissionCondition[]) =>
  Object.fromEntries(needs.map((n) => [n, true])) as Partial<
    Record<PermissionCondition, boolean>
  >;

describe("the matrix matches the specification, row by row", () => {
  it("covers exactly the actions the specification lists, and no others", () => {
    expect([...PERMISSION_ACTIONS].sort()).toEqual(Object.keys(SPEC).sort());
  });

  it("has exactly the three roles of §161, with no Team Lead role", () => {
    expect([...WORKSPACE_ROLES]).toEqual([
      "owner_admin",
      "manager",
      "staff_sales",
    ]);
    expect(WORKSPACE_ROLES).not.toContain("team_lead");
  });

  for (const action of Object.keys(SPEC) as PermissionAction[]) {
    for (const role of WORKSPACE_ROLES) {
      const cell = SPEC[action][ROLE_INDEX[role]];

      it(`${role} · ${action} · ${cell.k}`, () => {
        switch (cell.k) {
          case "yes": {
            const d = evaluatePermission({ role, action });
            expect(d.allowed).toBe(true);
            break;
          }
          case "no": {
            const d = evaluatePermission({ role, action });
            expect(d).toMatchObject({ allowed: false, reason: "role_denied" });
            break;
          }
          case "decision": {
            // §163.18: denied until approved, never assumed.
            const d = evaluatePermission({ role, action });
            expect(d).toMatchObject({
              allowed: false,
              reason: "decision_required",
            });
            // A workspace toggle must not be able to grant it.
            expect(can({ role, action, toggles: { [action]: true } })).toBe(
              false,
            );
            break;
          }
          case "configurable": {
            const needs = cell.needs ?? [];
            // Unset is not a grant.
            expect(evaluatePermission({ role, action })).toMatchObject({
              allowed: false,
              reason: "toggle_not_configured",
            });
            expect(
              evaluatePermission({
                role,
                action,
                toggles: { [action]: false },
              }),
            ).toMatchObject({ allowed: false, reason: "toggle_disabled" });
            const on = evaluatePermission({
              role,
              action,
              toggles: { [action]: true },
              conditions: allTrue(needs),
            });
            expect(on.allowed).toBe(true);
            // Every scope constraint is required even once the toggle is on.
            for (const need of needs) {
              expect(can({ role, action, toggles: { [action]: true } })).toBe(
                false,
              );
              expect(
                can({
                  role,
                  action,
                  toggles: { [action]: true },
                  conditions: { ...allTrue(needs), [need]: false },
                }),
              ).toBe(false);
            }
            break;
          }
          case "when": {
            expect(evaluatePermission({ role, action })).toMatchObject({
              allowed: false,
              reason: "condition_unverified",
            });
            expect(can({ role, action, conditions: allTrue(cell.needs) })).toBe(
              true,
            );
            for (const need of cell.needs) {
              expect(
                can({
                  role,
                  action,
                  conditions: { ...allTrue(cell.needs), [need]: false },
                }),
              ).toBe(false);
            }
            break;
          }
          case "team_lead_only": {
            expect(can({ role, action, isTeamLeadOfTeamConcerned: true })).toBe(
              true,
            );
            expect(
              evaluatePermission({
                role,
                action,
                isTeamLeadOfTeamConcerned: false,
              }),
            ).toMatchObject({ allowed: false, reason: "role_denied" });
            // Unstated responsibility is not held.
            expect(can({ role, action })).toBe(false);
            break;
          }
          case "team_lead_else_decision": {
            expect(can({ role, action, isTeamLeadOfTeamConcerned: true })).toBe(
              true,
            );
            expect(
              evaluatePermission({
                role,
                action,
                isTeamLeadOfTeamConcerned: false,
              }),
            ).toMatchObject({ allowed: false, reason: "decision_required" });
            expect(can({ role, action })).toBe(false);
            break;
          }
          case "no_team_lead_pending": {
            // Denied as the role, and still denied as Team Lead — but for the
            // §163.18 reason, which is a different fact worth preserving.
            expect(
              evaluatePermission({
                role,
                action,
                isTeamLeadOfTeamConcerned: false,
              }),
            ).toMatchObject({ allowed: false, reason: "role_denied" });
            expect(
              evaluatePermission({
                role,
                action,
                isTeamLeadOfTeamConcerned: true,
              }),
            ).toMatchObject({ allowed: false, reason: "decision_required" });
            break;
          }
        }
      });
    }
  }
});

describe("Team Lead is a responsibility, not a role (§161, §163.3)", () => {
  it("is never accepted as a role", () => {
    expect(
      evaluatePermission({
        role: "team_lead" as WorkspaceRole,
        action: "view_reports",
      }),
    ).toMatchObject({ allowed: false, reason: "unknown_role" });
  });

  it("does not change what the underlying role may do elsewhere", () => {
    // §161: holding it "changes neither their role nor their record access".
    const asLead = { isTeamLeadOfTeamConcerned: true } as const;
    expect(
      can({ role: "staff_sales", action: "view_reports", ...asLead }),
    ).toBe(false);
    expect(
      can({ role: "staff_sales", action: "manage_users", ...asLead }),
    ).toBe(false);
    expect(can({ role: "manager", action: "manage_users", ...asLead })).toBe(
      false,
    );
    expect(
      can({ role: "manager", action: "manage_sales_teams", ...asLead }),
    ).toBe(false);
  });

  it("gives a Manager who leads a team the confirmed Team Lead capabilities", () => {
    // §162: "A Manager who is the active Team Lead of a team therefore keeps
    // every confirmed Team Lead capability for that team."
    for (const action of [
      "view_own_team_minimum_roster",
      "view_own_team_eligible_pool",
      "view_own_team_assignment_required_warning",
      "change_own_team_members_lead_assignment_eligibility",
    ] as const) {
      expect(
        can({ role: "manager", action, isTeamLeadOfTeamConcerned: true }),
      ).toBe(true);
      expect(
        can({ role: "manager", action, isTeamLeadOfTeamConcerned: false }),
      ).toBe(false);
    }
  });

  it("confers nothing for a team the actor does not lead", () => {
    // The input names the team concerned; false means "not the lead of THIS
    // team", which must deny even if they lead another.
    expect(
      can({
        role: "staff_sales",
        action: "change_own_team_members_lead_assignment_eligibility",
        isTeamLeadOfTeamConcerned: false,
      }),
    ).toBe(false);
  });
});

describe("unknown and missing inputs fail closed", () => {
  it("denies an unknown role", () => {
    expect(
      evaluatePermission({
        role: "admin" as WorkspaceRole,
        action: "view_reports",
      }),
    ).toMatchObject({ allowed: false, reason: "unknown_role" });
  });

  it("denies an unknown action", () => {
    expect(
      evaluatePermission({
        role: "owner_admin",
        action: "delete_everything" as PermissionAction,
      }),
    ).toMatchObject({ allowed: false, reason: "unknown_action" });
  });

  it("denies a prototype-inherited action name", () => {
    expect(
      evaluatePermission({
        role: "owner_admin",
        action: "toString" as PermissionAction,
      }),
    ).toMatchObject({ allowed: false, reason: "unknown_action" });
  });

  it("denies when the input itself is absent", () => {
    expect(
      evaluatePermission(
        undefined as unknown as Parameters<typeof evaluatePermission>[0],
      ),
    ).toMatchObject({ allowed: false, reason: "unknown_role" });
  });

  it("treats a non-boolean condition as unverified, not as truthy", () => {
    expect(
      can({
        role: "staff_sales",
        action: "complete_renewal_or_set_next_due_date",
        conditions: { assigned_to_actor: "yes" as unknown as boolean },
      }),
    ).toBe(false);
  });

  it("treats a non-boolean toggle as not configured", () => {
    expect(
      can({
        role: "manager",
        action: "import_export",
        toggles: { import_export: 1 as unknown as boolean },
      }),
    ).toBe(false);
  });
});

describe("requiredConditions describes, and never grants", () => {
  it("lists what a conditional cell depends on", () => {
    expect(
      requiredConditions(
        "manager",
        "manually_resolve_lead_in_assignment_required",
      ),
    ).toEqual(["record_in_actor_scope", "team_in_actor_scope"]);
    expect(
      requiredConditions(
        "staff_sales",
        "link_lead_to_existing_accessible_customer",
      ),
    ).toEqual(["can_access_both_records"]);
  });

  it("is empty for unconditional, denied and pending cells alike", () => {
    expect(requiredConditions("owner_admin", "view_reports")).toEqual([]);
    expect(requiredConditions("staff_sales", "manage_users")).toEqual([]);
    expect(requiredConditions("manager", "manage_sales_teams")).toEqual([]);
  });

  it("follows the Team Lead branch it is asked about", () => {
    expect(
      requiredConditions("staff_sales", "view_own_team_minimum_roster", {
        isTeamLeadOfTeamConcerned: true,
      }),
    ).toEqual([]);
  });
});

describe("record access — §162.1", () => {
  const nobody = {} as const;

  it("gives Owner/Admin every record in their workspace", () => {
    expect(
      evaluateRecordAccess({ role: "owner_admin", relationship: nobody }),
    ).toMatchObject({ allowed: true, basis: "role_owner_admin" });
  });

  it("denies a Manager until the workspace configures the scope", () => {
    expect(
      evaluateRecordAccess({ role: "manager", relationship: nobody }),
    ).toMatchObject({
      allowed: false,
      reason: "manager_scope_not_configured",
    });
  });

  it("gives a Manager on All Records every record in that workspace", () => {
    expect(
      evaluateRecordAccess({
        role: "manager",
        managerRecordScope: "all_records",
        relationship: nobody,
      }),
    ).toMatchObject({ allowed: true, basis: "manager_all_records" });
  });

  it("limits a Manager on Own/Assigned/Shared to exactly those three", () => {
    const scoped = {
      role: "manager",
      managerRecordScope: "own_assigned_shared",
    } as const;
    expect(
      evaluateRecordAccess({ ...scoped, relationship: nobody }),
    ).toMatchObject({
      allowed: false,
      reason: "no_qualifying_relationship",
    });
    expect(
      evaluateRecordAccess({ ...scoped, relationship: { isOwner: true } }),
    ).toMatchObject({ allowed: true, basis: "owner" });
    expect(
      evaluateRecordAccess({
        ...scoped,
        relationship: { isExplicitlyShared: true },
      }),
    ).toMatchObject({ allowed: true, basis: "explicit_share" });
  });

  it("never treats All Records as reaching beyond the workspace", () => {
    // The function takes no workspace input at all, so it cannot widen tenancy.
    // Tenant isolation is enforced separately and independently (§6.1 / RLS).
    const decision = evaluateRecordAccess({
      role: "manager",
      managerRecordScope: "all_records",
    });
    expect(decision).toMatchObject({ allowed: true, source: "§162.1" });
    expect(Object.keys({ role: 1, managerRecordScope: 1 })).not.toContain(
      "workspaceId",
    );
  });

  it("gives Staff/Sales their own records", () => {
    expect(
      evaluateRecordAccess({
        role: "staff_sales",
        relationship: { isOwner: true },
      }),
    ).toMatchObject({ allowed: true, basis: "owner" });
  });

  it("gives Staff/Sales explicitly shared records", () => {
    expect(
      evaluateRecordAccess({
        role: "staff_sales",
        relationship: { isExplicitlyShared: true },
      }),
    ).toMatchObject({ allowed: true, basis: "explicit_share" });
  });

  it("refuses assignment alone, without the validated related-record permission", () => {
    // §162.1: "Operational assignment must never be used as a hidden
    // record-sharing mechanism."
    expect(
      evaluateRecordAccess({
        role: "staff_sales",
        relationship: { isAssigned: true },
      }),
    ).toMatchObject({ allowed: false, reason: "no_qualifying_relationship" });
    expect(
      evaluateRecordAccess({
        role: "staff_sales",
        relationship: {
          isAssigned: true,
          relatedRecordPermissionValidated: true,
        },
      }),
    ).toMatchObject({ allowed: true, basis: "validated_assignment" });
  });

  it("denies a Staff/Sales user with no relationship to the record", () => {
    expect(
      evaluateRecordAccess({ role: "staff_sales", relationship: nobody }),
    ).toMatchObject({ allowed: false, reason: "no_qualifying_relationship" });
  });

  it("denies an unknown role", () => {
    expect(
      evaluateRecordAccess({ role: "superuser" as WorkspaceRole }),
    ).toMatchObject({ allowed: false, reason: "unknown_role" });
  });

  it("denies an unrecognised Manager scope rather than guessing", () => {
    expect(
      evaluateRecordAccess({
        role: "manager",
        managerRecordScope:
          "everything" as (typeof MANAGER_RECORD_SCOPES)[number],
        relationship: { isOwner: false },
      }),
    ).toMatchObject({ allowed: false, reason: "manager_scope_not_configured" });
  });

  it("offers no input through which team membership could grant access", () => {
    // §162.1: "Sales Team membership alone grants no access"; a WhatsApp
    // conversation assignment "grants no access to the related Lead or
    // Customer". Neither is a field on RecordRelationship.
    const relationship = {
      isOwner: false,
      isAssigned: false,
      isExplicitlyShared: false,
      // Not part of the type; present here to prove it is ignored.
      isTeamMember: true,
      hasAssignedConversation: true,
    } as never;
    expect(
      evaluateRecordAccess({ role: "staff_sales", relationship }),
    ).toMatchObject({
      allowed: false,
      reason: "no_qualifying_relationship",
    });
  });
});

describe("a role permission is never record access", () => {
  it("permits the action in principle while the record stays out of reach", () => {
    // A Staff/Sales user may "edit permitted records" as a role permission, but
    // that says nothing about any particular record: §162's rows "define what a
    // user may do with a record they can already access".
    expect(can({ role: "staff_sales", action: "edit_permitted_records" })).toBe(
      true,
    );
    expect(
      evaluateRecordAccess({
        role: "staff_sales",
        relationship: { isOwner: false },
      }),
    ).toMatchObject({ allowed: false });
  });

  it("keeps sharing away from Record Owners who are Staff/Sales", () => {
    // §162.1: ordinary Record Owners "must not be able to grant or revoke
    // access merely because they own the record".
    expect(
      can({
        role: "staff_sales",
        action: "grant_or_revoke_explicit_record_share",
      }),
    ).toBe(false);
  });
});

describe("couplings other code depends on", () => {
  /**
   * The §34 stage-occupancy guard in `20261021090000_leads.sql` is SECURITY
   * INVOKER: it counts the Leads the CALLER can see. That is sound only
   * because deactivating a stage needs `configure_crm_settings`, and an
   * Owner/Admin's Lead policy covers every Lead in the workspace.
   *
   * If this row ever became configurable for Managers, a Manager scoped to
   * "Own, Assigned and Explicitly Shared" could see fewer Leads than exist
   * and the occupancy check would under-count — so the migration would have
   * to change in the same breath. This test is what makes that impossible to
   * do quietly.
   */
  it("keeps Configure CRM Settings to Owner/Admin, which the occupancy guard relies on", () => {
    expect(can({ role: "owner_admin", action: "configure_crm_settings" })).toBe(
      true,
    );
    for (const role of ["manager", "staff_sales"] as const) {
      // Not merely "denied today": denied with no toggle that could grant it.
      expect(can({ role, action: "configure_crm_settings" })).toBe(false);
      expect(
        can({
          role,
          action: "configure_crm_settings",
          toggles: { configure_crm_settings: true },
        }),
      ).toBe(false);
    }
  });
});
