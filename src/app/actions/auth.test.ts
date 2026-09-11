import { beforeEach, describe, expect, it, vi } from "vitest";

import { INVALID_CREDENTIALS } from "@/lib/auth/errors";

/**
 * Authentication Server Actions.
 *
 * The double is placed at the Supabase boundary only. Validation, redirect
 * safety, error mapping and enumeration resistance are all executed for real,
 * because those are the behaviours worth protecting.
 */

const { redirectMock, RedirectError } = vi.hoisted(() => {
  class RedirectError extends Error {
    url: string;
    constructor(url: string) {
      super(`NEXT_REDIRECT:${url}`);
      this.name = "RedirectError";
      this.url = url;
    }
  }
  return {
    RedirectError,
    redirectMock: vi.fn((url: string) => {
      throw new RedirectError(url);
    }),
  };
});

const auth = vi.hoisted(() => ({
  signUp: vi.fn(),
  signInWithPassword: vi.fn(),
  resend: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  getClaims: vi.fn(),
  updateUser: vi.fn(),
  signOut: vi.fn(),
}));

const { createClient, headersMock } = vi.hoisted(() => ({
  createClient: vi.fn(),
  headersMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("next/headers", () => ({ headers: headersMock }));
vi.mock("@/lib/supabase/server", () => ({ createClient }));

const actions = await import("@/app/actions/auth");

const STRONG = "Corr3ctHorseBattery";

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.append(key, value);
  return data;
}

/** Run an action expected to redirect, and report where it went. */
async function redirectedTo(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    if (error instanceof RedirectError) return error.url;
    throw error;
  }
  throw new Error("Expected a redirect, but the action returned normally.");
}

/** The callback link the sign-up call asked Supabase to email. */
function signUpCallbackLink(): string {
  return firstCallArg<{ options: { emailRedirectTo: string } }>(auth.signUp, 0)
    .options.emailRedirectTo;
}

/** Read an argument of the first recorded call, asserting it was made. */
function firstCallArg<T>(
  mock: { mock: { calls: unknown[][] } },
  index: number,
): T {
  const call = mock.mock.calls[0];
  if (!call)
    throw new Error("Expected the Supabase method to have been called.");
  return call[index] as T;
}

beforeEach(() => {
  vi.clearAllMocks();
  createClient.mockResolvedValue({ auth });
  headersMock.mockResolvedValue(
    new Headers({ host: "crm.example.com", "x-forwarded-proto": "https" }),
  );
  auth.signUp.mockResolvedValue({ error: null });
  auth.signInWithPassword.mockResolvedValue({ error: null });
  auth.resend.mockResolvedValue({ error: null });
  auth.resetPasswordForEmail.mockResolvedValue({ error: null });
  auth.getClaims.mockResolvedValue({ data: { claims: { sub: "u" } } });
  auth.updateUser.mockResolvedValue({ error: null });
  auth.signOut.mockResolvedValue({ error: null });
});

/* ------------------------------------------------------------------ sign up */

describe("signUpAction", () => {
  const valid = {
    fullName: "Ann Sebastian",
    email: "Ann@Example.com",
    password: STRONG,
    confirmPassword: STRONG,
  };

  it("rejects invalid input before contacting Supabase", async () => {
    const state = await actions.signUpAction(
      {},
      form({ ...valid, email: "nope", confirmPassword: "mismatch" }),
    );
    expect(state.fieldErrors?.email).toBeDefined();
    expect(state.fieldErrors?.confirmPassword).toBe("Passwords do not match");
    expect(auth.signUp).not.toHaveBeenCalled();
  });

  it("does not trust client-side validation — a missing field is caught server-side", async () => {
    const state = await actions.signUpAction({}, form({}));
    expect(Object.keys(state.fieldErrors ?? {}).length).toBeGreaterThan(0);
    expect(auth.signUp).not.toHaveBeenCalled();
  });

  it("normalises the address and carries the name as metadata", async () => {
    await redirectedTo(() => actions.signUpAction({}, form(valid)));
    expect(auth.signUp).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "ann@example.com",
        password: STRONG,
        options: expect.objectContaining({
          data: { full_name: "Ann Sebastian" },
        }),
      }),
    );
  });

  it("sends the user to the verification screen", async () => {
    const url = await redirectedTo(() => actions.signUpAction({}, form(valid)));
    expect(url).toBe("/verify-email?email=ann%40example.com");
  });

  it("builds the callback link on the server origin, never from form input", async () => {
    await redirectedTo(() =>
      actions.signUpAction(
        {},
        form({ ...valid, next: "https://evil.test/harvest" }),
      ),
    );
    const link = signUpCallbackLink();
    expect(new URL(link).origin).toBe("https://crm.example.com");
    expect(link).not.toContain("evil.test");
  });

  it("keeps a safe next on the callback link", async () => {
    await redirectedTo(() =>
      actions.signUpAction({}, form({ ...valid, next: "/leads" })),
    );
    const link = new URL(signUpCallbackLink());
    expect(link.searchParams.get("next")).toBe("/leads");
  });

  it("returns a generic message and does not reveal an existing account", async () => {
    auth.signUp.mockResolvedValue({
      error: {
        code: "user_already_exists",
        message: "User already registered",
      },
    });
    const state = await actions.signUpAction({}, form(valid));
    expect(state.error).toBe("Something went wrong. Please try again.");
    expect(state.error).not.toMatch(/registered|exists/i);
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("never echoes the submitted password back to the client", async () => {
    auth.signUp.mockResolvedValue({ error: { message: "boom" } });
    const state = await actions.signUpAction({}, form(valid));
    expect(JSON.stringify(state)).not.toContain(STRONG);
  });
});

/* ------------------------------------------------------------------ sign in */

describe("signInAction", () => {
  const valid = { email: "ann@example.com", password: "whatever" };

  it("rejects a malformed address before contacting Supabase", async () => {
    const state = await actions.signInAction(
      {},
      form({ email: "nope", password: "x" }),
    );
    expect(state.fieldErrors?.email).toBeDefined();
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it("requires a password", async () => {
    const state = await actions.signInAction(
      {},
      form({ email: "ann@example.com", password: "" }),
    );
    expect(state.fieldErrors?.password).toBeDefined();
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it("signs in with the normalised address", async () => {
    await redirectedTo(() =>
      actions.signInAction({}, form({ ...valid, email: " ANN@example.com " })),
    );
    expect(auth.signInWithPassword).toHaveBeenCalledWith({
      email: "ann@example.com",
      password: "whatever",
    });
  });

  it("lands on the dashboard by default", async () => {
    expect(
      await redirectedTo(() => actions.signInAction({}, form(valid))),
    ).toBe("/dashboard");
  });

  it("honours a safe next", async () => {
    const url = await redirectedTo(() =>
      actions.signInAction({}, form({ ...valid, next: "/customers/42" })),
    );
    expect(url).toBe("/customers/42");
  });

  it.each([
    "https://evil.test/steal",
    "//evil.test",
    "/\\evil.test",
    "javascript:alert(1)",
  ])("refuses to forward to %s after signing in", async (next) => {
    const url = await redirectedTo(() =>
      actions.signInAction({}, form({ ...valid, next })),
    );
    expect(url).toBe("/dashboard");
  });

  it("shows one message for bad credentials and does not redirect", async () => {
    auth.signInWithPassword.mockResolvedValue({
      error: {
        code: "invalid_credentials",
        message: "Invalid login credentials",
      },
    });
    const state = await actions.signInAction({}, form(valid));
    expect(state.error).toBe(INVALID_CREDENTIALS);
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("flags an unconfirmed account so the UI can offer a resend", async () => {
    auth.signInWithPassword.mockResolvedValue({
      error: { code: "email_not_confirmed" },
    });
    const state = await actions.signInAction({}, form(valid));
    expect(state.code).toBe("email_not_confirmed");
  });

  it("never echoes the submitted password back to the client", async () => {
    auth.signInWithPassword.mockResolvedValue({
      error: { message: "Invalid login credentials" },
    });
    const state = await actions.signInAction(
      {},
      form({ email: "ann@example.com", password: "hunter2-secret" }),
    );
    expect(JSON.stringify(state)).not.toContain("hunter2-secret");
  });
});

/* ---------------------------------------------------------- forgot password */

describe("forgotPasswordAction", () => {
  it("validates the address", async () => {
    const state = await actions.forgotPasswordAction(
      {},
      form({ email: "nope" }),
    );
    expect(state.fieldErrors?.email).toBeDefined();
    expect(auth.resetPasswordForEmail).not.toHaveBeenCalled();
  });

  it("answers identically whether or not the account exists", async () => {
    const known = await actions.forgotPasswordAction(
      {},
      form({ email: "ann@example.com" }),
    );

    auth.resetPasswordForEmail.mockResolvedValue({
      error: { message: "User not found", status: 400 },
    });
    const unknown = await actions.forgotPasswordAction(
      {},
      form({ email: "nobody@example.com" }),
    );

    expect(known).toEqual(unknown);
    expect(known.error).toBeUndefined();
    expect(known.success).toMatch(/if an account exists/i);
  });

  it("points the reset link at the reset screen on our own origin", async () => {
    await actions.forgotPasswordAction({}, form({ email: "ann@example.com" }));
    const link = new URL(
      firstCallArg<{ redirectTo: string }>(auth.resetPasswordForEmail, 1)
        .redirectTo,
    );
    expect(link.origin).toBe("https://crm.example.com");
    expect(link.pathname).toBe("/auth/confirm");
    // Destination comes from `type=recovery` at the callback, not from `next`.
    expect(link.searchParams.get("next")).toBeNull();
  });

  it("does surface a rate limit, which says nothing about the account", async () => {
    auth.resetPasswordForEmail.mockResolvedValue({ error: { status: 429 } });
    const state = await actions.forgotPasswordAction(
      {},
      form({ email: "ann@example.com" }),
    );
    expect(state.code).toBe("rate_limited");
  });
});

/* ----------------------------------------------------------- reset password */

describe("updatePasswordAction", () => {
  const valid = { password: STRONG, confirmPassword: STRONG };

  it("requires the confirmation to match", async () => {
    const state = await actions.updatePasswordAction(
      {},
      form({ password: STRONG, confirmPassword: "Different1Pass" }),
    );
    expect(state.fieldErrors?.confirmPassword).toBe("Passwords do not match");
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it("applies the password policy", async () => {
    const state = await actions.updatePasswordAction(
      {},
      form({ password: "weak", confirmPassword: "weak" }),
    );
    expect(state.fieldErrors?.password).toBeDefined();
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it("refuses to update without the session the recovery link establishes", async () => {
    auth.getClaims.mockResolvedValue({
      data: null,
      error: { message: "no session" },
    });
    const state = await actions.updatePasswordAction({}, form(valid));
    expect(state.error).toMatch(/no longer valid/i);
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it("updates the password and confirms on a dedicated screen", async () => {
    const url = await redirectedTo(() =>
      actions.updatePasswordAction({}, form(valid)),
    );
    expect(auth.updateUser).toHaveBeenCalledWith({ password: STRONG });
    expect(url).toBe("/reset-password/done");
  });

  it("explains password reuse without leaking the raw error", async () => {
    auth.updateUser.mockResolvedValue({
      error: {
        code: "same_password",
        message: "New password should be different",
      },
    });
    const state = await actions.updatePasswordAction({}, form(valid));
    expect(state.error).toMatch(/not used before/i);
    expect(JSON.stringify(state)).not.toContain(STRONG);
  });
});

/* ------------------------------------------------- resend verification mail */

describe("resendVerificationAction", () => {
  it("validates the address", async () => {
    const state = await actions.resendVerificationAction(
      {},
      form({ email: "nope" }),
    );
    expect(state.fieldErrors?.email).toBeDefined();
    expect(auth.resend).not.toHaveBeenCalled();
  });

  it("resends a signup confirmation to our own callback", async () => {
    const state = await actions.resendVerificationAction(
      {},
      form({ email: "ann@example.com" }),
    );
    expect(auth.resend).toHaveBeenCalledWith(
      expect.objectContaining({ type: "signup", email: "ann@example.com" }),
    );
    expect(state.success).toBeDefined();
  });

  it("asks the user to wait when Supabase throttles", async () => {
    auth.resend.mockResolvedValue({ error: { status: 429 } });
    const state = await actions.resendVerificationAction(
      {},
      form({ email: "ann@example.com" }),
    );
    expect(state.code).toBe("rate_limited");
    expect(state.success).toBeUndefined();
  });
});

/* ----------------------------------------------------------------- sign out */

describe("signOutAction", () => {
  it("clears the session, then returns the user to sign-in", async () => {
    const url = await redirectedTo(() => actions.signOutAction());
    expect(auth.signOut).toHaveBeenCalledTimes(1);
    expect(url).toBe("/sign-in");
  });

  it("signs out before redirecting, not after", async () => {
    const order: string[] = [];
    auth.signOut.mockImplementation(async () => {
      order.push("signOut");
      return { error: null };
    });
    redirectMock.mockImplementationOnce((url: string) => {
      order.push("redirect");
      throw new RedirectError(url);
    });
    await redirectedTo(() => actions.signOutAction());
    expect(order).toEqual(["signOut", "redirect"]);
  });
});
