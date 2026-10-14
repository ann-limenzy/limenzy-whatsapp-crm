import { describe, expect, it } from "vitest";

import {
  DEFAULT_ENABLED_MODULES,
  MODULE_KEYS,
  MODULE_LABELS,
  applyModuleChange,
  isModuleKey,
  refuseModuleChange,
  resolveEnabledModules,
  type ModuleKey,
} from "./modules";

/**
 * The module registry, checked against the specification.
 *
 * Expectations are transcribed from §8, §171 and §172 rather than derived from
 * the implementation, for the same reason as in `permissions.test.ts`.
 */

const setOf = (...keys: ModuleKey[]) => new Set<ModuleKey>(keys);
const ALL = setOf(...MODULE_KEYS);

describe("the switchable modules are the six in §171", () => {
  it("lists exactly those six", () => {
    expect([...MODULE_KEYS]).toEqual([
      "leads",
      "customer_followups",
      "products_services",
      "renewals_reminders",
      "whatsapp",
      "email",
    ]);
  });

  it("does not make Customer Management switchable", () => {
    // §171: "Customer Management remains a core module and cannot be disabled."
    expect(MODULE_KEYS).not.toContain("customers");
    expect(MODULE_KEYS).not.toContain("customer_management");
  });

  it("labels every module", () => {
    for (const key of MODULE_KEYS) expect(MODULE_LABELS[key]).toBeTruthy();
  });
});

describe("an unconfigured workspace gets §8's recommended setup", () => {
  it("enables all six by default", () => {
    // §8: "the default setup enables Leads, Customer Follow-ups,
    // Products/Services, Renewals & Reminders, WhatsApp and Email."
    expect([...DEFAULT_ENABLED_MODULES].sort()).toEqual(
      [...MODULE_KEYS].sort(),
    );
  });

  it("treats null and undefined as unconfigured, not as 'none enabled'", () => {
    expect(resolveEnabledModules(null)).toEqual(ALL);
    expect(resolveEnabledModules(undefined)).toEqual(ALL);
  });

  it("treats an empty array as a real choice: nothing switchable is on", () => {
    // Distinct from unconfigured — a workspace may legitimately disable all six
    // and still have core Customer Management.
    expect(resolveEnabledModules([]).size).toBe(0);
  });

  it("drops stored values that are not modules", () => {
    expect(resolveEnabledModules(["leads", "nonsense", "", "email"])).toEqual(
      setOf("leads", "email"),
    );
  });

  it("collapses duplicates", () => {
    expect(resolveEnabledModules(["leads", "leads"])).toEqual(setOf("leads"));
  });
});

describe("isModuleKey refuses anything that is not a module", () => {
  it.each([null, undefined, 42, {}, [], "customers", "LEADS", "", "toString"])(
    "rejects %s",
    (value) => {
      expect(isModuleKey(value)).toBe(false);
    },
  );
});

describe("§172 dependency: Renewals & Reminders requires Products & Services", () => {
  it("blocks disabling Products & Services while Renewals is enabled", () => {
    const refusal = refuseModuleChange("products_services", false, ALL);
    expect(refusal).not.toBeNull();
    expect(refusal?.conflictsWith).toBe("renewals_reminders");
    // §172 gives the shape of the explanation: name the dependent feature and
    // say what must be disabled first.
    expect(refusal?.message).toContain("Products & Services");
    expect(refusal?.message).toContain("Renewals & Reminders");
    expect(refusal?.message).toMatch(/first/i);
  });

  it("allows disabling Products & Services once Renewals is off", () => {
    const enabled = setOf("leads", "products_services", "whatsapp");
    expect(refuseModuleChange("products_services", false, enabled)).toBeNull();
  });

  it("blocks enabling Renewals while Products & Services is off", () => {
    // §8: "Renewals & Reminders cannot be enabled unless Products & Services
    // is enabled."
    const enabled = setOf("leads");
    const refusal = refuseModuleChange("renewals_reminders", true, enabled);
    expect(refusal?.conflictsWith).toBe("products_services");
    expect(refusal?.message).toMatch(/Enable Products & Services first/i);
  });

  it("allows enabling Renewals once Products & Services is on", () => {
    expect(
      refuseModuleChange(
        "renewals_reminders",
        true,
        setOf("products_services"),
      ),
    ).toBeNull();
  });

  it("puts no identifier or tenant data in the explanation", () => {
    const refusal = refuseModuleChange("products_services", false, ALL);
    expect(refusal?.message).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/);
    expect(refusal?.message).not.toContain("@");
  });
});

describe("applying a change never cascades", () => {
  it("turns one module off and leaves the rest alone", () => {
    const result = applyModuleChange("whatsapp", false, ALL);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.enabled).not.toContain("whatsapp");
    expect(result.enabled).toHaveLength(MODULE_KEYS.length - 1);
  });

  it("refuses rather than silently disabling the dependent module", () => {
    // §172: disabling "does not silently disable another module without
    // informing the user".
    const result = applyModuleChange("products_services", false, ALL);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.refusal.conflictsWith).toBe("renewals_reminders");
  });

  it("is idempotent for a module already in the requested state", () => {
    const off = applyModuleChange("whatsapp", false, setOf("leads"));
    expect(off.ok && off.enabled).toEqual(["leads"]);
    const on = applyModuleChange("leads", true, setOf("leads"));
    expect(on.ok && on.enabled).toEqual(["leads"]);
  });

  it("stores the canonical order regardless of how it was built", () => {
    const result = applyModuleChange("leads", true, setOf("email", "whatsapp"));
    expect(result.ok && result.enabled).toEqual(["leads", "whatsapp", "email"]);
  });

  it("can disable every switchable module", () => {
    let enabled: ReadonlySet<ModuleKey> = ALL;
    // Renewals first, so the dependency is respected at each step.
    for (const key of ["renewals_reminders", ...MODULE_KEYS] as ModuleKey[]) {
      const result = applyModuleChange(key, false, enabled);
      if (result.ok) enabled = new Set(result.enabled);
    }
    expect(enabled.size).toBe(0);
  });
});
