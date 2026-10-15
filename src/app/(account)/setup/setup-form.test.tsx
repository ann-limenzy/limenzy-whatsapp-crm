import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SetupActionState } from "@/app/(account)/setup/setup-state";

/**
 * The `/setup` form.
 *
 * The Server Action is doubled - it is the server boundary, and its own suite
 * covers it. This file is about what the person filling the form in sees and
 * can operate: labels, defaults that never fight them, inline feedback, and
 * the states that must stop them submitting twice.
 */

const createWorkspaceAction = vi.hoisted(() =>
  vi.fn(async (previous: SetupActionState): Promise<SetupActionState> =>
    Object.freeze({ status: "idle", attempt: previous.attempt + 1 }),
  ),
);

const requireUser = vi.hoisted(() => vi.fn());
vi.mock("@/server/auth/require-user", () => ({
  requireUser,
  getAuthenticatedUser: vi.fn(),
}));

/**
 * The page now asks the resolver whether a creation form is the right screen
 * for this person at all, so the resolver is doubled here. The default is the
 * one state that renders a form; the routing cases set their own.
 */
const resolveWorkspaceContext = vi.hoisted(() => vi.fn());
vi.mock("@/server/auth/workspace-context", () => ({
  resolveWorkspaceContext,
}));

/** `redirect()` signals by throwing, exactly as Next.js does. */
class RedirectError extends Error {
  constructor(readonly url: string) {
    super(`NEXT_REDIRECT:${url}`);
  }
}
const redirectMock = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  redirect: (url: string) => redirectMock(url),
}));

vi.mock("@/app/(account)/setup/actions", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/app/(account)/setup/actions")>();
  return { ...actual, createWorkspaceAction };
});

const { SetupForm } = await import("@/app/(account)/setup/setup-form");
const { CURRENCY_OPTIONS, RETIRED_CURRENCIES, countryOptions } =
  await import("@/lib/workspace-options");

const COUNTRIES = countryOptions();

const renderForm = (props: Partial<{ defaultFullName: string }> = {}) =>
  render(
    <SetupForm
      defaultFullName={props.defaultFullName ?? "Ann Sebastian"}
      countries={COUNTRIES}
    />,
  );

/** Drive the action's answer for the next submission. */
const actionReturns = (state: Omit<SetupActionState, "attempt">) =>
  createWorkspaceAction.mockImplementation(async (previous: SetupActionState) =>
    Object.freeze({ ...state, attempt: previous.attempt + 1 }),
  );

const submit = async (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole("button", { name: /create my crm area/i }));

const originalDateTimeFormat = Intl.DateTimeFormat;
const originalLocale = Intl.Locale;

const withDetected = ({
  timeZone,
  languages,
}: {
  timeZone?: string;
  languages?: string[];
}) => {
  if (timeZone !== undefined) {
    const patched = function DateTimeFormat(this: unknown, ...args: unknown[]) {
      const Original = originalDateTimeFormat as unknown as new (
        ...args: unknown[]
      ) => Intl.DateTimeFormat;
      const instance = new Original(...args);
      const resolved = instance.resolvedOptions.bind(instance);
      instance.resolvedOptions = () => ({ ...resolved(), timeZone });
      return instance;
    } as unknown as typeof Intl.DateTimeFormat;
    vi.stubGlobal("Intl", { ...Intl, DateTimeFormat: patched });
  }
  if (languages !== undefined) {
    vi.stubGlobal("navigator", {
      ...navigator,
      language: languages[0] ?? "",
      languages,
    });
  }
};

beforeEach(() => {
  createWorkspaceAction.mockImplementation(async (previous: SetupActionState) =>
    Object.freeze({ status: "idle", attempt: previous.attempt + 1 }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  Object.defineProperty(Intl, "DateTimeFormat", {
    value: originalDateTimeFormat,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(Intl, "Locale", {
    value: originalLocale,
    configurable: true,
    writable: true,
  });
});

describe("the fields", () => {
  it("1/24. renders and labels all six controls", () => {
    renderForm();
    for (const label of [
      /your name/i,
      /business name/i,
      /business type/i,
      /^country/i,
      /^currency/i,
      /time zone/i,
    ]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
    expect(
      screen.getByRole("button", { name: /create my crm area/i }),
    ).toBeInTheDocument();
  });

  it("24. states which fields are required and which is optional", () => {
    renderForm();
    expect(screen.getByLabelText(/business type/i)).toHaveAccessibleName(
      /optional/i,
    );
    expect(screen.getByLabelText(/business name/i)).toHaveAccessibleName(
      /required/i,
    );
  });

  it("2. prefills the editable name from signup metadata", async () => {
    const user = userEvent.setup();
    renderForm({ defaultFullName: "Ann Sebastian" });
    const name = screen.getByLabelText(/your name/i);
    expect(name).toHaveValue("Ann Sebastian");

    await user.clear(name);
    await user.type(name, "Someone Else");
    expect(name).toHaveValue("Someone Else");
  });

  it("2. copes with no metadata name at all", () => {
    renderForm({ defaultFullName: "" });
    expect(screen.getByLabelText(/your name/i)).toHaveValue("");
  });

  it("3. keeps business type free text with suggestions, not a closed list", async () => {
    const user = userEvent.setup();
    renderForm();
    const field = screen.getByLabelText(/business type/i);
    expect(field.tagName).toBe("INPUT");

    await user.type(field, "Artisan Bakery and Cafe");
    expect(field).toHaveValue("Artisan Bakery and Cafe");

    // The eight examples are offered, not enforced.
    const list = document.getElementById(field.getAttribute("list") ?? "");
    const suggestions = [...(list?.querySelectorAll("option") ?? [])].map(
      (option) => option.getAttribute("value"),
    );
    expect(suggestions).toHaveLength(8);
    expect(suggestions).toContain("Financial / Insurance");
    expect(suggestions).toContain("Healthcare/Wellness");
  });

  it("4. shows human-readable country names beside the code", () => {
    renderForm();
    const country = screen.getByLabelText(/^country/i);
    const india = within(country).getByRole("option", {
      name: /india \(IN\)/i,
    });
    expect(india).toHaveValue("IN");
    // The submitted value is the code, never the name.
    expect(
      within(country).queryByRole("option", { name: "India" }),
    ).not.toBeInTheDocument();
  });

  it("5. offers no retired currency", () => {
    renderForm();
    const currency = screen.getByLabelText(/^currency/i);
    const codes = [...currency.querySelectorAll("option")].map((o) => o.value);
    for (const retired of RETIRED_CURRENCIES) {
      expect(`${retired}: ${codes.includes(retired)}`).toBe(
        `${retired}: false`,
      );
    }
    for (const offered of ["INR", "USD", "EUR", "GBP", "AED", "AUD"]) {
      expect(codes).toContain(offered);
    }
    expect(codes).toHaveLength(CURRENCY_OPTIONS.length + 1); // + placeholder
  });

  it("6. offers UTC and Asia/Kolkata, grouped by region", () => {
    renderForm();
    const zone = screen.getByLabelText(/time zone/i);
    const values = [...zone.querySelectorAll("option")].map((o) => o.value);
    expect(values).toContain("UTC");
    expect(values).toContain("Asia/Kolkata");
    // Offsets are never stored values.
    expect(values.some((value) => /^[+-]\d/.test(value))).toBe(false);

    const groups = [...zone.querySelectorAll("optgroup")].map((g) => g.label);
    expect(groups).toContain("Asia");
    expect(groups).toContain("Europe");
  });
});

describe("defaults never overwrite a person's choice", () => {
  it("7. adopts a detected time zone the validator accepts", async () => {
    withDetected({ timeZone: "Europe/London" });
    renderForm();
    await waitFor(() =>
      expect(screen.getByLabelText(/time zone/i)).toHaveValue("Europe/London"),
    );
  });

  it("8. ignores a detected time zone the validator would reject", async () => {
    withDetected({ timeZone: "Mars/Olympus" });
    renderForm();
    await waitFor(() =>
      expect(screen.getByLabelText(/time zone/i)).toHaveValue(""),
    );
  });

  it("9. adopts a country detected from the locale", async () => {
    withDetected({ languages: ["en-IN"] });
    renderForm();
    await waitFor(() =>
      expect(screen.getByLabelText(/^country/i)).toHaveValue("IN"),
    );
    // ...and suggests that country's currency.
    expect(screen.getByLabelText(/^currency/i)).toHaveValue("INR");
  });

  it("10. ignores a locale with no usable region", async () => {
    withDetected({ languages: ["xx", "en"] });
    renderForm();
    await waitFor(() =>
      expect(screen.getByLabelText(/^country/i)).toHaveValue(""),
    );
    expect(screen.getByLabelText(/^currency/i)).toHaveValue("");
  });

  it("11. suggests a currency when the country changes, while untouched", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.selectOptions(screen.getByLabelText(/^country/i), "IN");
    expect(screen.getByLabelText(/^currency/i)).toHaveValue("INR");

    await user.selectOptions(screen.getByLabelText(/^country/i), "GB");
    expect(screen.getByLabelText(/^currency/i)).toHaveValue("GBP");
  });

  it("12. never overwrites a currency the person chose", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.selectOptions(screen.getByLabelText(/^country/i), "IN");
    await user.selectOptions(screen.getByLabelText(/^currency/i), "USD");

    // A later country change must leave their decision alone.
    await user.selectOptions(screen.getByLabelText(/^country/i), "DE");
    expect(screen.getByLabelText(/^currency/i)).toHaveValue("USD");
    expect(screen.getByLabelText(/^country/i)).toHaveValue("DE");
  });

  it("11. leaves currency for the person when a country has no clear mapping", async () => {
    const user = userEvent.setup();
    renderForm();

    // A mapped country suggests its currency...
    await user.selectOptions(screen.getByLabelText(/^country/i), "IN");
    expect(screen.getByLabelText(/^currency/i)).toHaveValue("INR");

    // ...and moving to one with no single currency clears the suggestion
    // rather than attributing India's rupee to Antarctica.
    await user.selectOptions(screen.getByLabelText(/^country/i), "AQ");
    expect(screen.getByLabelText(/^currency/i)).toHaveValue("");
  });

  it("12. keeps a chosen currency even when the new country has no mapping", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.selectOptions(screen.getByLabelText(/^currency/i), "EUR");
    await user.selectOptions(screen.getByLabelText(/^country/i), "AQ");
    expect(screen.getByLabelText(/^currency/i)).toHaveValue("EUR");
  });

  it("11. keeps following the country after an automatic suggestion", async () => {
    // The regression manual testing found. A suggested currency must stay a
    // suggestion: detection fills it in, and every later country change still
    // updates it, because nothing about a suggestion is a person's choice.
    const user = userEvent.setup();
    withDetected({ languages: ["en-IN"] });
    renderForm();

    await waitFor(() =>
      expect(screen.getByLabelText(/^currency/i)).toHaveValue("INR"),
    );

    await user.selectOptions(screen.getByLabelText(/^country/i), "GB");
    expect(screen.getByLabelText(/^currency/i)).toHaveValue("GBP");

    await user.selectOptions(screen.getByLabelText(/^country/i), "AE");
    expect(screen.getByLabelText(/^currency/i)).toHaveValue("AED");
  });

  it("11. does not treat an echoed suggestion as a person's choice", async () => {
    // A change event is not proof of intent: browser autofill fires one, and
    // so does any event carrying the value the form just suggested. Neither
    // may latch the currency.
    const user = userEvent.setup();
    renderForm();

    await user.selectOptions(screen.getByLabelText(/^country/i), "IN");
    const currency = screen.getByLabelText(/^currency/i);
    expect(currency).toHaveValue("INR");

    // Re-select exactly what was suggested, as autofill would.
    await user.selectOptions(currency, "INR");
    await user.selectOptions(screen.getByLabelText(/^country/i), "DE");
    expect(currency).toHaveValue("EUR");
  });

  it("12. stops following once the person picks a different currency", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.selectOptions(screen.getByLabelText(/^country/i), "IN");
    expect(screen.getByLabelText(/^currency/i)).toHaveValue("INR");

    await user.selectOptions(screen.getByLabelText(/^currency/i), "USD");
    await user.selectOptions(screen.getByLabelText(/^country/i), "DE");
    expect(screen.getByLabelText(/^currency/i)).toHaveValue("USD");
  });

  it("13. never overwrites a time zone the person chose", async () => {
    const user = userEvent.setup();
    withDetected({ timeZone: "Europe/London" });
    renderForm();
    await waitFor(() =>
      expect(screen.getByLabelText(/time zone/i)).toHaveValue("Europe/London"),
    );

    await user.selectOptions(screen.getByLabelText(/time zone/i), "UTC");
    await user.selectOptions(screen.getByLabelText(/^country/i), "IN");
    expect(screen.getByLabelText(/time zone/i)).toHaveValue("UTC");
  });
});

describe("validation feedback", () => {
  it("14. gives inline feedback from the shared parser on blur", async () => {
    const user = userEvent.setup();
    renderForm({ defaultFullName: "" });

    const name = screen.getByLabelText(/your name/i);
    await user.type(name, "A");
    await user.tab();

    await waitFor(() => expect(name).toHaveAttribute("aria-invalid", "true"));
    const describedBy = name.getAttribute("aria-describedby") ?? "";
    const message = describedBy
      .split(" ")
      .map((id) => document.getElementById(id)?.textContent ?? "")
      .join(" ");
    expect(message).toMatch(/full name/i);
    // The rejected value is not repeated back at them.
    expect(message).not.toContain("A ");
  });

  it("15. shows server field issues beside the right controls", async () => {
    const user = userEvent.setup();
    actionReturns({
      status: "invalid",
      message: "Check the highlighted fields and try again.",
      fieldErrors: {
        country: "Select a country from the list",
        currency: "Select a currency from the list",
      },
    });
    renderForm();
    await submit(user);

    for (const [label, text] of [
      [/^country/i, "Select a country from the list"],
      [/^currency/i, "Select a currency from the list"],
    ] as const) {
      const control = await screen.findByLabelText(label);
      await waitFor(() =>
        expect(control).toHaveAttribute("aria-invalid", "true"),
      );
      const ids = (control.getAttribute("aria-describedby") ?? "").split(" ");
      const described = ids
        .map((id) => document.getElementById(id)?.textContent ?? "")
        .join(" ");
      expect(described).toContain(text);
    }
  });

  it("16. announces the form-level error and takes focus to it", async () => {
    const user = userEvent.setup();
    actionReturns({
      status: "invalid",
      message: "Check the highlighted fields and try again.",
      fieldErrors: { country: "Select a country from the list" },
    });
    renderForm();
    await submit(user);

    const summary = await screen.findByRole("alert");
    expect(summary).toHaveTextContent(/check the highlighted fields/i);
    await waitFor(() => expect(summary).toHaveFocus());
  });
});

describe("submission states", () => {
  it("17. disables the button and labels the pending state", async () => {
    const user = userEvent.setup();
    let release: (state: SetupActionState) => void = () => {};
    createWorkspaceAction.mockImplementation(
      () =>
        new Promise<SetupActionState>((resolve) => {
          release = resolve;
        }),
    );
    renderForm();
    await submit(user);

    const button = await screen.findByRole("button", {
      name: /creating your crm area/i,
    });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");

    release(Object.freeze({ status: "created", attempt: 1 }));
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: /creating/i }),
      ).not.toBeInTheDocument(),
    );
  });

  it("18. treats created as terminal and offers no second attempt", async () => {
    const user = userEvent.setup();
    actionReturns({
      status: "created",
      message: "Your company's CRM area is ready.",
    });
    renderForm();
    await submit(user);

    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent(/ready/i);
    expect(
      screen.queryByRole("button", { name: /create my crm area/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/business name/i)).not.toBeInTheDocument();
  });

  it("19. treats already-onboarded as terminal and reveals nothing", async () => {
    const user = userEvent.setup();
    actionReturns({
      status: "already_onboarded",
      message: "Setup is already complete for this account.",
    });
    renderForm();
    await submit(user);

    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent(/already complete/i);
    expect(
      screen.queryByRole("button", { name: /create my crm area/i }),
    ).not.toBeInTheDocument();
    expect(status.textContent ?? "").not.toMatch(/owner_admin|workspace id/i);
  });

  it("22. offers no creation fallback when access is unavailable", async () => {
    const user = userEvent.setup();
    actionReturns({
      status: "access_unavailable",
      message: "Ask an administrator at your company to restore your access.",
    });
    renderForm();
    await submit(user);

    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent(/administrator/i);
    expect(
      screen.queryByRole("button", { name: /create/i }),
    ).not.toBeInTheDocument();
  });

  it("20. keeps a temporary failure retryable", async () => {
    const user = userEvent.setup();
    actionReturns({
      status: "error",
      message: "We could not reach the service just now.",
    });
    renderForm();
    await submit(user);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /could not reach the service/i,
    );
    const button = screen.getByRole("button", { name: /create my crm area/i });
    expect(button).toBeEnabled();
    // The values they typed are still there to retry with.
    expect(screen.getByLabelText(/your name/i)).toHaveValue("Ann Sebastian");
  });

  it("21. offers a plain sign-in link when the session expired", async () => {
    const user = userEvent.setup();
    actionReturns({
      status: "unauthenticated",
      message: "Your session has expired. Sign in again to continue.",
    });
    renderForm();
    await submit(user);

    const link = await screen.findByRole("link", { name: /go to sign in/i });
    const href = link.getAttribute("href") ?? "";
    expect(href).toBe("/sign-in");
    // No caller-controlled return URL rides along.
    expect(href).not.toContain("?");
    expect(href).not.toContain("next=");
  });
});

describe("what the form must never show or do", () => {
  it("23. renders no identifier, role or claim in any state", async () => {
    const user = userEvent.setup();
    for (const state of [
      { status: "created", message: "Your company's CRM area is ready." },
      { status: "already_onboarded", message: "Setup is already complete." },
      { status: "access_unavailable", message: "Ask an administrator." },
    ] as const) {
      actionReturns(state);
      const { unmount } = renderForm();
      await submit(user);
      await screen.findByRole("status");

      const text = document.body.textContent ?? "";
      for (const secret of [
        "owner_admin",
        "manager",
        "staff_sales",
        "user_profile",
        "workspace_id",
        "auth_user_id",
      ]) {
        expect(`${secret}: ${text.includes(secret)}`).toBe(`${secret}: false`);
      }
      expect(text).not.toMatch(
        /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/,
      );
      unmount();
    }
  });

  it("25. keeps long option values from widening the layout", () => {
    renderForm();
    const zone = screen.getByLabelText(/time zone/i);
    // The control truncates and may shrink; a fixed width would push the page.
    expect(zone.className).toContain("truncate");
    expect(zone.className).toContain("w-full");
    expect(zone.className).toContain("min-w-0");

    const form = zone.closest("form");
    expect(form?.className).toContain("min-w-0");
  });

  it("24. associates every control with its label by id", () => {
    renderForm();
    for (const name of [
      "fullName",
      "workspaceName",
      "businessType",
      "country",
      "currency",
      "timeZone",
    ]) {
      const control = document.querySelector(`[name="${name}"]`);
      expect(control).not.toBeNull();
      const id = control?.getAttribute("id") ?? "";
      expect(id).not.toBe("");
      expect(document.querySelector(`label[for="${id}"]`)).not.toBeNull();
    }
  });
});

describe("the page hands the client only safe values", () => {
  /**
   * The page is an async Server Component, so it is called directly and the
   * element tree it returns is inspected. Nothing is mocked except the
   * authentication utility - what is being checked is precisely which props
   * cross into the client component.
   */
  const findSetupForm = (node: unknown): { [key: string]: unknown } | null => {
    if (!node || typeof node !== "object") return null;
    const element = node as {
      type?: unknown;
      props?: { children?: unknown; [key: string]: unknown };
    };
    if (element.type === SetupForm) return element.props ?? {};
    const children = element.props?.children;
    for (const child of Array.isArray(children) ? children : [children]) {
      const found = findSetupForm(child);
      if (found) return found;
    }
    return null;
  };

  const renderPage = async () => {
    resolveWorkspaceContext.mockResolvedValue({ kind: "onboarding_required" });
    redirectMock.mockImplementation((url: string) => {
      throw new RedirectError(url);
    });
    const { default: SetupPage } = await import("@/app/(account)/setup/page");
    return findSetupForm(await SetupPage());
  };

  /** Where the page sent a visitor who should not see a creation form. */
  const routeFor = async (kind: string): Promise<string> => {
    resolveWorkspaceContext.mockResolvedValue({
      kind,
      ...(kind === "ok"
        ? { context: { workspaceId: "w" }, role: "owner_admin" }
        : {}),
    });
    redirectMock.mockImplementation((url: string) => {
      throw new RedirectError(url);
    });
    const { default: SetupPage } = await import("@/app/(account)/setup/page");
    try {
      await SetupPage();
      return "(rendered)";
    } catch (error) {
      if (error instanceof RedirectError) return error.url;
      throw error;
    }
  };

  const VERIFIED = {
    id: "1a1a1a1a-1111-4111-8111-1111111111aa",
    email: "person@example.com",
    emailVerified: true,
    fullName: "Ann Sebastian",
  };

  it("passes only the display name and the country labels", async () => {
    requireUser.mockResolvedValue(VERIFIED);
    const props = await renderPage();
    expect(props).not.toBeNull();
    expect(Object.keys(props ?? {}).sort()).toEqual([
      "countries",
      "defaultFullName",
    ]);
    expect(props?.defaultFullName).toBe("Ann Sebastian");
  });

  it("passes no Auth UUID, email, claim or role to the client", async () => {
    requireUser.mockResolvedValue(VERIFIED);
    const props = await renderPage();
    const serialized = JSON.stringify(props);
    for (const secret of [
      VERIFIED.id,
      VERIFIED.email,
      "emailVerified",
      "claims",
      "owner_admin",
      "auth_user_id",
      "user_profile",
      "workspace_id",
    ]) {
      expect(`${secret}: ${serialized.includes(secret)}`).toBe(
        `${secret}: false`,
      );
    }
  });

  it("copes with an account that has no metadata name", async () => {
    requireUser.mockResolvedValue({ ...VERIFIED, fullName: null });
    const props = await renderPage();
    expect(props?.defaultFullName).toBe("");
  });

  it("keeps the authentication check and mints no context", async () => {
    requireUser.mockResolvedValue(VERIFIED);
    await renderPage();
    expect(requireUser).toHaveBeenCalledWith("/setup");

    const { readFile } = await import("node:fs/promises");
    const source = (await readFile("src/app/(account)/setup/page.tsx", "utf8"))
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");
    /**
     * Phase 4D: the page resolves and may redirect, so that someone who
     * already has a workspace is routed to it instead of being shown a
     * creation form. It still mints nothing, reads no cookie and touches no
     * database module directly.
     */
    for (const forbidden of [
      "createTenantContext",
      "withTenant",
      "resolveVerifiedIdentity",
      "cookies(",
      "server/db/",
    ]) {
      expect(`${forbidden}: ${source.includes(forbidden)}`).toBe(
        `${forbidden}: false`,
      );
    }
  });

  it("shows the creation form only to someone who has no workspace", async () => {
    requireUser.mockResolvedValue(VERIFIED);
    // Routed onward, not offered a second workspace or a replacement one.
    expect(await routeFor("ok")).toBe("/");
    expect(await routeFor("workspace_selection_required")).toBe(
      "/select-workspace",
    );
    expect(await routeFor("access_unavailable")).toBe("/no-access");
    expect(await routeFor("unauthenticated")).toBe("/verify-email");
  });
});

describe("narrow screens", () => {
  /**
   * jsdom performs no layout, so `scrollWidth` cannot be measured here. What a
   * source-level guard CAN do is stop the change that reliably causes
   * horizontal overflow on a 320px phone: a large fixed or minimum width that
   * applies at every breakpoint. This mirrors `src/test/narrow-screen.test.ts`,
   * which does the same for the application shell.
   */
  const RISKY =
    /(?:^|[\s"'`])(?:min-)?w-\[(\d+)px\]|(?:^|[\s"'`])(?:min-)?w-(\d{2,})(?![\w-])/g;

  it("uses no large unconditional width in the setup route", async () => {
    const { readFile } = await import("node:fs/promises");
    const offenders: string[] = [];

    for (const file of [
      "src/app/(account)/setup/page.tsx",
      "src/app/(account)/setup/setup-form.tsx",
    ]) {
      const source = await readFile(file, "utf8");
      for (const line of source.split("\n")) {
        for (const match of line.matchAll(RISKY)) {
          const raw = match[1] ?? match[2] ?? "";
          const pixels = match[1] ? Number(raw) : Number(raw) * 4;
          if (pixels < 160) continue;
          // A width behind a breakpoint can only apply once there is room.
          const prefixed = /(sm|md|lg|xl|2xl):(?:min-)?w-/.test(
            line.slice(Math.max(0, match.index - 8), match.index + 8),
          );
          if (!prefixed) offenders.push(`${file}: ${line.trim()}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("lets every wide control shrink inside its container", () => {
    renderForm();
    // A select holding 554 time zones is the one that would push the page.
    for (const label of [/^country/i, /^currency/i, /time zone/i]) {
      const control = screen.getByLabelText(label);
      expect(control.className).toContain("w-full");
      expect(control.className).toContain("min-w-0");
    }
    // The grid and the form itself must be shrinkable too, or a wide child
    // forces the page wider than the viewport.
    const grid = screen.getByLabelText(/^country/i).closest("div.grid");
    expect(grid?.className).toContain("min-w-0");
  });

  it("stacks into one column before the responsive grid applies", () => {
    renderForm();
    const country = screen.getByLabelText(/^country/i);
    const grid = country
      .closest("form")
      ?.querySelector("div.grid.lg\\:grid-cols-2");
    expect(grid).not.toBeNull();
    // Two columns only from lg; phones get a single column.
    expect(grid?.className).toContain("lg:grid-cols-2");
    expect(grid?.className).not.toMatch(/(?:^|\s)grid-cols-2/);
  });

  it("keeps the submit control full-width on a phone", () => {
    renderForm();
    const button = screen.getByRole("button", { name: /create my crm area/i });
    expect(button.className).toContain("w-full");
    expect(button.className).toContain("sm:w-auto");
  });
});
