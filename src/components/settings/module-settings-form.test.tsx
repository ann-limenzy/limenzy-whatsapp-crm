// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Settings → Modules & Features — spec §171, §172.
 *
 * What this screen must get right: it submits one module at a time to the
 * Server Action, it shows the §172 explanation verbatim when a change is
 * blocked, and it never pretends a refused change succeeded.
 *
 * It is NOT the gate. The action re-resolves the membership and re-checks the
 * Owner/Admin role server-side, which `src/app/actions/modules.test.ts`
 * covers; rendering or hiding a button here is presentation only.
 */

const actionState = vi.hoisted(() => ({
  current: { status: "idle" } as Record<string, unknown>,
}));
vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return {
    ...actual,
    useActionState: () => [actionState.current, vi.fn(), false],
  };
});
vi.mock("@/app/actions/modules", () => ({ setModuleEnabledAction: vi.fn() }));

const { ModuleSettingsForm } = await import("./module-settings-form");
const { MODULE_KEYS, MODULE_LABELS } = await import("@/lib/modules");

beforeEach(() => {
  actionState.current = { status: "idle" };
});

const renderForm = (
  enabled: readonly string[],
  usingDefaults = false,
): ReturnType<typeof render> =>
  render(
    <ModuleSettingsForm
      modules={MODULE_KEYS}
      enabled={enabled as never}
      usingDefaults={usingDefaults}
    />,
  );

describe("it lists exactly the six switchable modules (§171)", () => {
  it("names every one", () => {
    renderForm(MODULE_KEYS);
    for (const key of MODULE_KEYS) {
      // One visible label per module, and one button that names it.
      expect(screen.getByText(MODULE_LABELS[key])).toBeTruthy();
      expect(
        screen.getByRole("button", { name: `Disable ${MODULE_LABELS[key]}` }),
      ).toBeTruthy();
    }
  });

  it("offers no control for Customer Management", () => {
    renderForm(MODULE_KEYS);
    expect(screen.queryByText("Customer Management")).toBeNull();
    // …and says why, so the absence is not mistaken for an oversight.
    expect(
      screen.getByText(/core module and cannot be disabled/i),
    ).toBeTruthy();
  });
});

describe("each row offers the change that applies to it", () => {
  it("offers Disable for an enabled module and Enable for a disabled one", () => {
    renderForm(["leads"]);

    const disable = screen.getByRole("button", { name: /Disable Leads/i });
    const enable = screen.getByRole("button", { name: /Enable WhatsApp/i });
    expect(disable).toBeTruthy();
    expect(enable).toBeTruthy();
  });

  it("submits the module and the requested state, one module per form", () => {
    const { container } = renderForm(["leads"]);
    const forms = container.querySelectorAll("form");
    expect(forms).toHaveLength(MODULE_KEYS.length);

    const values = [...forms].map((form) => ({
      module: form.querySelector<HTMLInputElement>('input[name="module"]')
        ?.value,
      enable: form.querySelector<HTMLInputElement>('input[name="enable"]')
        ?.value,
    }));
    // Leads is on, so its form asks to turn it off; the rest ask to turn on.
    expect(values).toContainEqual({ module: "leads", enable: "false" });
    expect(values).toContainEqual({ module: "whatsapp", enable: "true" });
  });

  it("reports each module's current state in words, not only by button", () => {
    renderForm(["leads"]);
    expect(screen.getAllByText("Enabled")).toHaveLength(1);
    expect(screen.getAllByText("Disabled")).toHaveLength(
      MODULE_KEYS.length - 1,
    );
  });
});

describe("a blocked change is explained (§172)", () => {
  it("shows the dependency message verbatim", () => {
    const message =
      "Products & Services cannot be disabled while Renewals & Reminders is enabled. Disable Renewals & Reminders first.";
    actionState.current = { status: "blocked", message };
    renderForm(MODULE_KEYS);

    expect(screen.getByText(/That change was blocked/i)).toBeTruthy();
    // The wording is the specification's; this component must not reword it.
    expect(screen.getByText(message)).toBeTruthy();
  });

  it("says nothing was changed when the role is refused", () => {
    actionState.current = { status: "forbidden" };
    renderForm(MODULE_KEYS);
    expect(
      screen.getByText(/Only an Owner\/Admin can change modules/i),
    ).toBeTruthy();
  });

  it("says nothing was changed when the configuration is unavailable", () => {
    actionState.current = { status: "unavailable" };
    renderForm(MODULE_KEYS);
    expect(screen.getByText(/cannot be configured yet/i)).toBeTruthy();
    expect(screen.getByText(/Nothing was changed/i)).toBeTruthy();
  });

  it("shows no alert at rest", () => {
    renderForm(MODULE_KEYS);
    expect(screen.queryByText(/blocked/i)).toBeNull();
    expect(screen.queryByText(/Nothing was changed/i)).toBeNull();
  });
});

describe("an unconfigured workspace is labelled as such (§8)", () => {
  it("explains that the recommended setup is in use", () => {
    renderForm(MODULE_KEYS, true);
    expect(screen.getByText(/recommended setup/i)).toBeTruthy();
  });

  it("says nothing about defaults once the workspace has its own choice", () => {
    renderForm(["leads"], false);
    expect(screen.queryByText(/recommended setup/i)).toBeNull();
  });
});
