import { describe, expect, it } from "vitest";

import {
  GENERIC_AUTH_ERROR,
  INVALID_CREDENTIALS,
  mapResendError,
  mapSignInError,
  mapSignUpError,
  mapUpdatePasswordError,
} from "@/lib/auth/errors";

/**
 * These tests protect two things at once: that users get a useful message,
 * and that the message never reveals whether an account exists or what went
 * wrong internally.
 */

describe("sign-in errors never enable account enumeration", () => {
  it("returns the same message for an unknown address and a wrong password", () => {
    const unknown = mapSignInError({
      code: "invalid_credentials",
      message: "Invalid login credentials",
    });
    const wrongPassword = mapSignInError({
      message: "Invalid login credentials",
      status: 400,
    });
    expect(unknown.message).toBe(INVALID_CREDENTIALS);
    expect(wrongPassword.message).toBe(INVALID_CREDENTIALS);
    expect(unknown.message).toBe(wrongPassword.message);
  });

  it("does distinguish an unconfirmed account, so the user can resend", () => {
    const mapped = mapSignInError({ code: "email_not_confirmed" });
    expect(mapped.code).toBe("email_not_confirmed");
    expect(mapped.message).toMatch(/confirm your email/i);
  });

  it("surfaces rate limiting, which is about behaviour not existence", () => {
    expect(mapSignInError({ status: 429 }).code).toBe("rate_limited");
    expect(mapSignInError({ code: "over_request_rate_limit" }).code).toBe(
      "rate_limited",
    );
  });

  it("never echoes the raw Supabase message", () => {
    const raw = "AuthApiError: database connection to 10.0.0.4 refused";
    const mapped = mapSignInError({ message: raw, status: 500 });
    expect(mapped.message).not.toContain("10.0.0.4");
    expect(mapped.message).not.toContain("AuthApiError");
    expect(mapped.message).toBe(INVALID_CREDENTIALS);
  });
});

describe("sign-up errors", () => {
  it("does not reveal that an address is already registered", () => {
    const mapped = mapSignUpError({
      code: "user_already_exists",
      message: "User already registered",
    });
    expect(mapped.message).toBe(GENERIC_AUTH_ERROR);
    expect(mapped.message).not.toMatch(/already/i);
  });

  it("asks for a stronger password when the server says so", () => {
    expect(mapSignUpError({ code: "weak_password" }).message).toMatch(
      /stronger/i,
    );
  });

  it("collapses anything unrecognised to the generic message", () => {
    expect(mapSignUpError({ message: "some internal detail" }).message).toBe(
      GENERIC_AUTH_ERROR,
    );
    expect(mapSignUpError(null).message).toBe(GENERIC_AUTH_ERROR);
    expect(mapSignUpError(undefined).message).toBe(GENERIC_AUTH_ERROR);
  });
});

describe("password update errors", () => {
  it("explains password reuse", () => {
    expect(mapUpdatePasswordError({ code: "same_password" }).message).toMatch(
      /not used before/i,
    );
  });

  it("treats an unknown failure as an expired link", () => {
    expect(mapUpdatePasswordError({ message: "boom" }).message).toMatch(
      /no longer valid/i,
    );
  });
});

describe("resend errors", () => {
  it("asks the user to wait when throttled", () => {
    const mapped = mapResendError({ status: 429 });
    expect(mapped.code).toBe("rate_limited");
    expect(mapped.message).toMatch(/wait/i);
  });

  it("does not expose the configured interval", () => {
    expect(mapResendError({ status: 429 }).message).not.toMatch(
      /\d+\s*second/i,
    );
  });
});
