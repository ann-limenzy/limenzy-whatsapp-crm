import "server-only";

import {
  DEFAULT_ENABLED_MODULES,
  MODULE_KEYS,
  applyModuleChange,
  isModuleKey,
  resolveEnabledModules,
  type ModuleChangeRefusal,
  type ModuleKey,
} from "@/lib/modules";
import { withTenant, type TenantTx } from "@/server/db/tenant";
import type { TenantContext } from "@/server/db/tenant-context";

/**
 * The workspace's module configuration — spec §171, §172.
 *
 * Read through `withTenant()`, so the statement runs under row-level security
 * with the tenant settings established: the workspace row is visible only
 * while the caller holds an active membership of it. There is no path here
 * that reads another workspace's configuration, because there is no workspace
 * identifier to pass — the context decides which row is reachable.
 *
 * ## Why a missing column is tolerated
 *
 * `enabled_modules` arrives in a migration that is prepared but deliberately
 * not applied to the hosted development project. Until it is applied, the
 * column does not exist and PostgreSQL answers `42703 undefined_column`.
 *
 * That case is treated exactly as an unconfigured workspace: §8's recommended
 * setup, all six modules enabled. The alternative — failing the request —
 * would take down every application route over configuration that the
 * specification already supplies a default for.
 *
 * It is detected by **asking first**, not by failing and recovering. Catching
 * the error is not enough and was measured not to work: PostgreSQL marks a
 * transaction failed after `42703`, and postgres.js records the error on the
 * transaction scope and rethrows it once the callback resolves, so a `try`
 * inside the transaction cannot suppress it. A savepoint could, but it would
 * still mean provoking an error on a normal code path.
 *
 * So the column's presence is checked against `information_schema.columns` in
 * the same transaction, and the column is named only when it is there. Nothing
 * is caught, which means every database failure — a permission error, a
 * connection fault, anything — propagates. Silently enabling every module
 * because the database is broken would be the worst available answer.
 */

/** Distinguishes "the column is not there" from "the column is NULL". */
const MISSING_COLUMN = Symbol("enabled_modules column absent");

/**
 * Is `workspaces.enabled_modules` present and readable by this role?
 *
 * `information_schema.columns` lists only columns the current role holds a
 * privilege on, which is the right question: a column this connection cannot
 * read is, for its purposes, not there.
 */
async function columnExists(tx: TenantTx): Promise<boolean> {
  const rows = await tx<{ present: boolean }[]>`
    select exists (
      select 1 from information_schema.columns
       where table_schema = 'public'
         and table_name = 'workspaces'
         and column_name = 'enabled_modules'
    ) as present
  `;
  return rows[0]?.present === true;
}

export type WorkspaceModules = {
  readonly enabled: ReadonlySet<ModuleKey>;
  /**
   * True when the workspace has never been configured, or the column is not
   * there yet, so `enabled` is §8's default rather than a stored choice.
   */
  readonly usingDefaults: boolean;
};

/**
 * Read the modules enabled for the context's workspace.
 *
 * Never throws for an unconfigured workspace: that is a normal state with a
 * specified answer.
 */
export async function enabledModulesFor(
  context: TenantContext,
): Promise<WorkspaceModules> {
  const stored = await withTenant(context, async (tx) => {
    // Ask before naming it. See the note above: a 42703 cannot be recovered
    // from inside the transaction.
    if (!(await columnExists(tx))) return MISSING_COLUMN;

    const rows = await tx<{ enabled_modules: string[] | null }[]>`
      select enabled_modules from public.workspaces
    `;
    // No row means the policy did not match — not an error here, but it is
    // certainly not a configuration, so the default applies.
    if (rows.length === 0) return null;
    return rows[0]?.enabled_modules ?? null;
  });

  if (stored === MISSING_COLUMN || stored === null) return defaults();
  return { enabled: resolveEnabledModules(stored), usingDefaults: false };
}

function defaults(): WorkspaceModules {
  return { enabled: new Set(DEFAULT_ENABLED_MODULES), usingDefaults: true };
}

/**
 * Turn one module on or off — spec §171 (Owner/Admin), §172 (dependencies).
 *
 * Three independent layers decide whether this write lands, and none of them
 * replaces the others:
 *
 *   1. the caller, which must establish that the actor is an Owner/Admin
 *      before calling — this function is not where the role is resolved;
 *   2. the §172 dependency rules, applied here against the workspace's current
 *      configuration, which refuse rather than cascade;
 *   3. row-level security and the column-scoped UPDATE grant, which allow this
 *      write only for an active owner_admin of the selected workspace, and only
 *      on this column.
 *
 * The read and the write share one transaction, so the dependency decision is
 * made against the state the write applies to rather than a stale snapshot.
 */
export type ModuleUpdateResult =
  | { readonly ok: true; readonly enabled: readonly ModuleKey[] }
  | {
      readonly ok: false;
      readonly reason: "refused";
      readonly refusal: ModuleChangeRefusal;
    }
  | { readonly ok: false; readonly reason: "unknown_module" }
  | { readonly ok: false; readonly reason: "not_configurable" };

export async function setModuleEnabled(
  context: TenantContext,
  module: string,
  enable: boolean,
): Promise<ModuleUpdateResult> {
  if (!isModuleKey(module)) return { ok: false, reason: "unknown_module" };

  return withTenant(context, async (tx) => {
    if (!(await columnExists(tx)))
      return { ok: false, reason: "not_configurable" } as const;

    const rows = await tx<{ enabled_modules: string[] | null }[]>`
      select enabled_modules from public.workspaces
    `;
    if (rows.length === 0)
      return { ok: false, reason: "not_configurable" } as const;

    const current =
      rows[0]?.enabled_modules === null ||
      rows[0]?.enabled_modules === undefined
        ? new Set(DEFAULT_ENABLED_MODULES)
        : resolveEnabledModules(rows[0].enabled_modules);

    const result = applyModuleChange(module, enable, current);
    if (!result.ok)
      return {
        ok: false,
        reason: "refused",
        refusal: result.refusal,
      } as const;

    const written = await tx<{ enabled_modules: string[] | null }[]>`
        update public.workspaces
           set enabled_modules = ${[...result.enabled]}
        returning enabled_modules
      `;
    // Zero rows means row-level security refused the write — the actor is not
    // an owner_admin of this workspace. Reported, never assumed successful.
    if (written.length === 0)
      return { ok: false, reason: "not_configurable" } as const;

    return { ok: true, enabled: result.enabled } as const;
  });
}

/** The switchable modules, for rendering a settings list. */
export const CONFIGURABLE_MODULES: readonly ModuleKey[] = MODULE_KEYS;
