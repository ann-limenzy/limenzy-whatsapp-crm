/**
 * Workspace modules — spec §8 (onboarding defaults), §171 (Modules &
 * Features) and §172 (Module Dependencies).
 *
 * Pure policy, like `./permissions`: a deterministic function of its inputs,
 * no database, no request, no I/O. The workspace's stored configuration is
 * read elsewhere and passed in.
 *
 * ## What a module controls
 *
 * §171: "Disabling a module hides its normal navigation and entry points but
 * does not delete existing data." §172 adds that disabling "prevents new
 * activity belonging to that module" and "does not delete existing or
 * historical data".
 *
 * So a disabled module is a gate on *new activity and navigation*, not a
 * retention rule and not a permission. It composes with — and never replaces
 * — the §162 permission matrix and the §162.1 record access in
 * `./permissions`. A module being enabled says nothing about whether a
 * particular user may act, and a permission says nothing about whether the
 * module is available.
 */

/**
 * The six modules a workspace can turn on and off — §171.
 *
 * Customer Management is deliberately absent: §171 states it "remains a core
 * module and cannot be disabled", so it is not a switch and has no key here.
 */
export const MODULE_KEYS = [
  "leads",
  "customer_followups",
  "products_services",
  "renewals_reminders",
  "whatsapp",
  "email",
] as const;

export type ModuleKey = (typeof MODULE_KEYS)[number];

/** Human labels, as §171 lists them. */
export const MODULE_LABELS: Record<ModuleKey, string> = {
  leads: "Leads",
  customer_followups: "Customer Follow-ups",
  products_services: "Products & Services",
  renewals_reminders: "Renewals & Reminders",
  whatsapp: "WhatsApp",
  email: "Email",
};

/**
 * What a workspace starts with — spec §8.
 *
 * "Skip and use recommended setup — If selected, the default setup enables
 * Leads, Customer Follow-ups, Products/Services, Renewals & Reminders,
 * WhatsApp and Email." That is all six, so an unconfigured workspace behaves
 * exactly as the specification's recommended setup does.
 */
export const DEFAULT_ENABLED_MODULES: readonly ModuleKey[] = [...MODULE_KEYS];

/**
 * Hard dependencies between modules — §172.
 *
 * Only the module-to-module rules live here. §172's other dependencies are on
 * *configuration* rather than modules — an active WhatsApp connection, a
 * verified email sender, an eligible template — and those belong to the
 * features that need them, not to this gate. Inventing them here would claim
 * enforcement this slice does not implement.
 */
export const MODULE_REQUIRES: Partial<Record<ModuleKey, readonly ModuleKey[]>> =
  {
    // §172: "Renewals & Reminders requires Products & Services."
    renewals_reminders: ["products_services"],
  };

/** Whether a module is a recognised key. Anything else is not a module. */
export function isModuleKey(value: unknown): value is ModuleKey {
  return (
    typeof value === "string" &&
    (MODULE_KEYS as readonly string[]).includes(value)
  );
}

/**
 * Normalise stored configuration into the set the application uses.
 *
 * Unrecognised entries are dropped rather than trusted: stored data can
 * outlive a rename, and a value that is not a module cannot enable one.
 * Duplicates collapse. A `null` or absent configuration means the workspace
 * has never been configured, which §8 answers with the recommended setup.
 */
export function resolveEnabledModules(
  stored: readonly string[] | null | undefined,
): ReadonlySet<ModuleKey> {
  if (stored === null || stored === undefined) {
    return new Set(DEFAULT_ENABLED_MODULES);
  }
  return new Set(stored.filter(isModuleKey));
}

/**
 * Why a requested change is refused, if it is — §172 "Dependency Behaviour".
 *
 * §172 requires the CRM to "block the change and explain which dependent
 * feature must be disabled first", and gives the wording of the example. Two
 * directions are refused:
 *
 *   - disabling a module another enabled module requires;
 *   - enabling a module whose own requirement is not enabled, which §8 states
 *     for onboarding ("Renewals & Reminders cannot be enabled unless Products
 *     & Services is enabled") and §172 implies for Settings.
 *
 * Returns `null` when the change is allowed. The message names modules only —
 * it carries no identifier and no tenant data.
 */
export type ModuleChangeRefusal = {
  readonly module: ModuleKey;
  readonly enable: boolean;
  /** The module that makes the change impossible. */
  readonly conflictsWith: ModuleKey;
  readonly message: string;
};

export function refuseModuleChange(
  module: ModuleKey,
  enable: boolean,
  enabled: ReadonlySet<ModuleKey>,
): ModuleChangeRefusal | null {
  if (!isModuleKey(module)) return null;

  if (enable) {
    for (const required of MODULE_REQUIRES[module] ?? []) {
      if (!enabled.has(required)) {
        return {
          module,
          enable,
          conflictsWith: required,
          message:
            `${MODULE_LABELS[module]} cannot be enabled while ` +
            `${MODULE_LABELS[required]} is disabled. Enable ` +
            `${MODULE_LABELS[required]} first.`,
        };
      }
    }
    return null;
  }

  // Disabling: refuse if any still-enabled module requires this one.
  for (const candidate of MODULE_KEYS) {
    if (candidate === module || !enabled.has(candidate)) continue;
    if ((MODULE_REQUIRES[candidate] ?? []).includes(module)) {
      return {
        module,
        enable,
        conflictsWith: candidate,
        message:
          `${MODULE_LABELS[module]} cannot be disabled while ` +
          `${MODULE_LABELS[candidate]} is enabled. Disable ` +
          `${MODULE_LABELS[candidate]} first.`,
      };
    }
  }
  return null;
}

/**
 * Apply a single change, or report why it was refused.
 *
 * §172: disabling "does not silently disable another module without informing
 * the user", so this never cascades. One switch, one outcome.
 */
export type ModuleChangeResult =
  | { readonly ok: true; readonly enabled: readonly ModuleKey[] }
  | { readonly ok: false; readonly refusal: ModuleChangeRefusal };

export function applyModuleChange(
  module: ModuleKey,
  enable: boolean,
  enabled: ReadonlySet<ModuleKey>,
): ModuleChangeResult {
  const refusal = refuseModuleChange(module, enable, enabled);
  if (refusal) return { ok: false, refusal };

  const next = new Set(enabled);
  if (enable) next.add(module);
  else next.delete(module);
  // Stored in the canonical order, so the column never depends on click order.
  return { ok: true, enabled: MODULE_KEYS.filter((key) => next.has(key)) };
}
