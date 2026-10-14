import "server-only";

import {
  CONFIGURABLE_PERMISSIONS,
  MANAGER_RECORD_SCOPES,
  evaluatePermission,
  evaluateRecordAccess,
  isConfigurablePermission,
  type ManagerRecordScope,
  type PermissionAction,
  type PermissionCondition,
  type PermissionDecision,
  type RecordAccessDecision,
  type RecordRelationship,
  type WorkspaceRole,
} from "@/lib/permissions";
import { withTenant, type TenantTx } from "@/server/db/tenant";
import type { TenantContext } from "@/server/db/tenant-context";

/**
 * The workspace's permission configuration — spec §162 and §162.1.
 *
 * Two settings live here, and only two, because they are the only ones the
 * specification leaves to a workspace:
 *
 *   * which §162 "Configurable" cells are granted, and
 *   * the §162.1 Manager record scope.
 *
 * Everything else in the matrix is fixed. A "Decision required" cell cannot
 * appear: the configurable list is derived from the matrix itself, the column
 * has a closed check constraint, and `evaluatePermission` would ignore a
 * toggle for a non-configurable cell even if one were somehow stored.
 *
 * ## Fail closed, and say so
 *
 * The specification names no default for either setting. §162 says
 * "Configurable" without saying what it starts as, and §162.1 says the
 * workspace "configures" the scope without naming a starting value. Inventing
 * one would be inventing product policy, so an unconfigured workspace keeps
 * the existing behaviour — every configurable cell denied, and Manager record
 * access denied — and `isConfigured` lets the settings screen say plainly that
 * a choice is needed rather than looking like a workspace where everything
 * happens to be off.
 *
 * ## What is read, and from where
 *
 * Read through `withTenant()`, so the row is reachable only while the caller
 * holds an active membership of the workspace the context names. Nothing here
 * takes a workspace id, a role or a permission fact from a caller's input: the
 * context decides the row, and the role comes from the membership the request
 * already resolved.
 */

/** Columns arriving in a migration that may not be applied yet. */
const COLUMNS = ["permissions_granted", "manager_record_scope"] as const;

/**
 * Are the permission columns present and readable?
 *
 * Asked rather than discovered by failing. A missing column raises `42703`,
 * which marks the transaction failed and which postgres.js re-raises after the
 * callback resolves, so it cannot be caught and recovered from here. Nothing
 * is caught, which means every other database failure propagates instead of
 * being mistaken for "unconfigured".
 */
async function columnsExist(tx: TenantTx): Promise<boolean> {
  const rows = await tx<{ n: number }[]>`
    select count(*)::int as n from information_schema.columns
     where table_schema = 'public'
       and table_name = 'workspaces'
       and column_name in ('permissions_granted', 'manager_record_scope')
  `;
  return (rows[0]?.n ?? 0) === COLUMNS.length;
}

export type WorkspacePermissionSettings = {
  /** §162 cells this workspace has granted. Empty when unconfigured. */
  readonly granted: ReadonlySet<PermissionAction>;
  /** §162.1 Manager scope, or undefined when the workspace has not chosen. */
  readonly managerRecordScope: ManagerRecordScope | undefined;
  /** False when the workspace has never been configured, or the columns are absent. */
  readonly isConfigured: boolean;
  /** True when the Manager scope specifically still needs choosing. */
  readonly managerScopeNeedsChoice: boolean;
};

const UNCONFIGURED: WorkspacePermissionSettings = {
  granted: new Set(),
  managerRecordScope: undefined,
  isConfigured: false,
  managerScopeNeedsChoice: true,
};

function readScope(value: unknown): ManagerRecordScope | undefined {
  return typeof value === "string" &&
    (MANAGER_RECORD_SCOPES as readonly string[]).includes(value)
    ? (value as ManagerRecordScope)
    : undefined;
}

/**
 * Keep only cells §162 actually marks Configurable.
 *
 * The database constraint says the same thing, but this runs regardless of
 * whether the constraint is present, and it is what guarantees a stored value
 * can never widen a fixed cell.
 */
function readGranted(value: unknown): Set<PermissionAction> {
  if (!Array.isArray(value)) return new Set();
  return new Set(
    value.filter((entry): entry is PermissionAction =>
      isConfigurablePermission(entry),
    ),
  );
}

/** Read the workspace's configuration. Never throws for an unconfigured one. */
export async function workspacePermissionSettings(
  context: TenantContext,
): Promise<WorkspacePermissionSettings> {
  const row = await withTenant(context, async (tx) => {
    if (!(await columnsExist(tx))) return undefined;
    const rows = await tx<
      {
        permissions_granted: string[] | null;
        manager_record_scope: string | null;
      }[]
    >`
      select permissions_granted, manager_record_scope from public.workspaces
    `;
    return rows[0];
  });

  if (row === undefined) return UNCONFIGURED;

  const granted = readGranted(row.permissions_granted);
  const managerRecordScope = readScope(row.manager_record_scope);
  return {
    granted,
    managerRecordScope,
    isConfigured: row.permissions_granted !== null,
    managerScopeNeedsChoice: managerRecordScope === undefined,
  };
}

/**
 * The evaluator, bound to this workspace's configuration.
 *
 * The one supported way to ask "may this role do this here". The role is the
 * caller's **verified** role from the resolved membership — this function has
 * no way to accept one from a request, because it takes the whole settings
 * object and the role separately and never parses input.
 *
 * `conditions` are facts about a specific record or team that the caller has
 * verified against stored data. They are not permission; §162's rows describe
 * what a user may do with a record they can already access, and whether they
 * can access it is `recordAccess()` below.
 */
export function permissionFor(
  settings: WorkspacePermissionSettings,
  role: WorkspaceRole,
  action: PermissionAction,
  conditions?: Partial<Record<PermissionCondition, boolean>>,
): PermissionDecision {
  // Only configurable cells get a toggle, and only the one the workspace set.
  // A fixed cell is unaffected by anything stored.
  const toggles: Partial<Record<PermissionAction, boolean>> = {};
  for (const entry of CONFIGURABLE_PERMISSIONS) {
    if (entry.role !== role) continue;
    // An unconfigured workspace supplies no toggle at all, so the policy
    // answers `toggle_not_configured` rather than `toggle_disabled`: not
    // configured and deliberately off are different facts.
    if (!settings.isConfigured) continue;
    toggles[entry.action] = settings.granted.has(entry.action);
  }

  return evaluatePermission({ role, action, toggles, conditions });
}

/**
 * Record access for this workspace's configured Manager scope — §162.1.
 *
 * Separate from `permissionFor` on purpose: a §162 permission is never
 * authority over a particular record, and §162.1 is authoritative for
 * visibility. Both layers apply, and neither replaces row-level security.
 */
export function recordAccess(
  settings: WorkspacePermissionSettings,
  role: WorkspaceRole,
  relationship: RecordRelationship,
): RecordAccessDecision {
  return evaluateRecordAccess({
    role,
    managerRecordScope: settings.managerRecordScope,
    relationship,
  });
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export type PermissionUpdateResult =
  | { readonly ok: true; readonly granted: readonly PermissionAction[] }
  | { readonly ok: false; readonly reason: "not_configurable_cell" }
  | { readonly ok: false; readonly reason: "not_configurable" };

/**
 * Grant or revoke one §162 "Configurable" cell.
 *
 * Refuses anything that is not a configurable cell **before** touching the
 * database, so a "Decision required" rule can never be stored as granted.
 *
 * The caller must already have established that the actor may configure the
 * CRM. This is not where the role is checked; row-level security and the
 * column-scoped grant are the backstop that make the write impossible for
 * anyone but an active owner_admin of this workspace.
 */
export async function setPermissionGranted(
  context: TenantContext,
  action: string,
  grant: boolean,
): Promise<PermissionUpdateResult> {
  if (!isConfigurablePermission(action)) {
    return { ok: false, reason: "not_configurable_cell" };
  }

  return withTenant(context, async (tx) => {
    if (!(await columnsExist(tx)))
      return { ok: false, reason: "not_configurable" } as const;

    const rows = await tx<{ permissions_granted: string[] | null }[]>`
      select permissions_granted from public.workspaces
    `;
    if (rows.length === 0)
      return { ok: false, reason: "not_configurable" } as const;

    const current = readGranted(rows[0]?.permissions_granted);
    if (grant) current.add(action);
    else current.delete(action);

    // Stored in the matrix's own order, so the column never depends on the
    // order someone happened to click.
    const next = CONFIGURABLE_PERMISSIONS.filter((entry) =>
      current.has(entry.action),
    ).map((entry) => entry.action);

    const written = await tx<{ permissions_granted: string[] | null }[]>`
      update public.workspaces
         set permissions_granted = ${[...next]}
      returning permissions_granted
    `;
    // Zero rows means row-level security refused: not an owner_admin here.
    if (written.length === 0)
      return { ok: false, reason: "not_configurable" } as const;

    return { ok: true, granted: next } as const;
  });
}

export type ScopeUpdateResult =
  | { readonly ok: true; readonly scope: ManagerRecordScope }
  | { readonly ok: false; readonly reason: "unknown_scope" }
  | { readonly ok: false; readonly reason: "not_configurable" };

/** Choose the §162.1 Manager record scope. */
export async function setManagerRecordScope(
  context: TenantContext,
  scope: string,
): Promise<ScopeUpdateResult> {
  const chosen = readScope(scope);
  if (chosen === undefined) return { ok: false, reason: "unknown_scope" };

  return withTenant(context, async (tx) => {
    if (!(await columnsExist(tx)))
      return { ok: false, reason: "not_configurable" } as const;

    const written = await tx<{ manager_record_scope: string | null }[]>`
      update public.workspaces
         set manager_record_scope = ${chosen}
      returning manager_record_scope
    `;
    if (written.length === 0)
      return { ok: false, reason: "not_configurable" } as const;

    return { ok: true, scope: chosen } as const;
  });
}
