import "server-only";

import type { BusinessSettingsInput } from "@/lib/validation/business-settings";
import { withTenant } from "@/server/db/tenant";
import type { TenantContext } from "@/server/db/tenant-context";

/**
 * Business Settings for the context's workspace — spec §158.
 *
 * Read and written through `withTenant()`, so every statement runs with the
 * tenant settings established and the workspace row is reachable only while
 * the caller holds an active membership of it. Neither function takes a
 * workspace identifier: the context decides which row is visible, so there is
 * no parameter through which a caller could reach another workspace.
 *
 * The role is **not** checked here. That is the caller's job, and the caller
 * does it from the membership the request resolved. The database is the layer
 * that cannot be bypassed: `workspaces_owner_admin_update` restricts UPDATE to
 * an active owner_admin of the selected workspace, and the grant is
 * column-scoped, so even a mistaken policy could not write a column that was
 * never granted.
 */

/**
 * The eight §158 fields, as stored.
 *
 * Deliberately the *parser's* output type rather than a second declaration of
 * the same eight fields. A read and a write of this row describe the same
 * thing, so giving them separate types would only create somewhere for them to
 * disagree — add a field to the schema and forget it here, and the read would
 * silently stop carrying it. It also keeps the shape importable by a client
 * component, which cannot import from this `server-only` module.
 */
export type BusinessSettings = BusinessSettingsInput;

type Row = {
  name: string;
  business_type: string | null;
  business_phone: string | null;
  business_email: string | null;
  address: string | null;
  country: string;
  currency: string;
  time_zone: string;
};

const toSettings = (row: Row): BusinessSettings => ({
  name: row.name,
  businessType: row.business_type,
  businessPhone: row.business_phone,
  businessEmail: row.business_email,
  address: row.address,
  country: row.country,
  currency: row.currency,
  timeZone: row.time_zone,
});

/**
 * Read the workspace's business settings.
 *
 * `null` means the policy matched no row — which for a resolved context should
 * not happen, and is reported rather than papered over with defaults. These
 * are stored business facts, not configuration with a specification-defined
 * fallback, so inventing one would be inventing data.
 */
export async function businessSettingsFor(
  context: TenantContext,
): Promise<BusinessSettings | null> {
  const rows = await withTenant(
    context,
    async (tx) =>
      tx<Row[]>`
        select name, business_type, business_phone, business_email,
               address, country, currency, time_zone
          from public.workspaces
      `,
  );
  return rows.length === 0 ? null : toSettings(rows[0]!);
}

export type BusinessSettingsUpdate =
  | { readonly ok: true; readonly settings: BusinessSettings }
  /** Row-level security refused the write: not an owner_admin of this workspace. */
  | { readonly ok: false; readonly reason: "not_permitted" };

/**
 * Write the workspace's business settings — §158.
 *
 * One statement, every field, because §158 presents them as a single form: a
 * partial write would let two concurrent saves interleave into a state neither
 * person submitted. `returning` is what distinguishes success from a policy
 * refusal — a refused UPDATE affects zero rows and raises nothing, so a caller
 * that ignored the result would report a successful save that never happened.
 *
 * Optional fields arrive already normalised to `null` by
 * `parseBusinessSettings`, so clearing one stores NULL rather than an empty
 * string, which the column's check constraint also enforces.
 */
export async function updateBusinessSettings(
  context: TenantContext,
  input: BusinessSettingsInput,
): Promise<BusinessSettingsUpdate> {
  const rows = await withTenant(
    context,
    async (tx) =>
      tx<Row[]>`
        update public.workspaces
           set name           = ${input.name},
               business_type  = ${input.businessType},
               business_phone = ${input.businessPhone},
               business_email = ${input.businessEmail},
               address        = ${input.address},
               country        = ${input.country},
               currency       = ${input.currency},
               time_zone      = ${input.timeZone}
        returning name, business_type, business_phone, business_email,
                  address, country, currency, time_zone
      `,
  );

  if (rows.length === 0) return { ok: false, reason: "not_permitted" };
  return { ok: true, settings: toSettings(rows[0]!) };
}
