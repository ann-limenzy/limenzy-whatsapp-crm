import { describe, expect, it } from "vitest";

import {
  checkPassword,
  emailSchema,
  forgotPasswordSchema,
  PASSWORD_MIN_LENGTH,
  resetPasswordSchema,
  signInSchema,
  signUpSchema,
} from "@/lib/auth/schemas";

const STRONG = "Corr3ctHorseBattery";

describe("email normalisation", () => {
  it("trims and lower-cases, so one address is one account", () => {
    expect(emailSchema.parse("  Owner@Example.COM ")).toBe("owner@example.com");
  });

  it.each([
    "",
    "  ",
    "not-an-email",
    "a@b",
    "@example.com",
    "user@",
    "a b@c.com",
  ])("rejects %j", (value) => {
    expect(emailSchema.safeParse(value).success).toBe(false);
  });

  it("rejects an absurdly long address", () => {
    expect(
      emailSchema.safeParse(`${"a".repeat(250)}@example.com`).success,
    ).toBe(false);
  });
});

describe("sign-up validation", () => {
  const valid = {
    fullName: "Ann Sebastian",
    email: "ann@example.com",
    password: STRONG,
    confirmPassword: STRONG,
  };

  it("accepts a complete, valid submission", () => {
    const parsed = signUpSchema.safeParse(valid);
    expect(parsed.success).toBe(true);
  });

  it("trims the name", () => {
    const parsed = signUpSchema.parse({ ...valid, fullName: "  Ann  " });
    expect(parsed.fullName).toBe("Ann");
  });

  it("requires a name of at least two characters", () => {
    expect(signUpSchema.safeParse({ ...valid, fullName: "A" }).success).toBe(
      false,
    );
  });

  it("rejects a mismatched confirmation, reported on the confirm field", () => {
    const parsed = signUpSchema.safeParse({
      ...valid,
      confirmPassword: `${STRONG}x`,
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const issue = parsed.error.issues.find(
        (i) => i.path[0] === "confirmPassword",
      );
      expect(issue?.message).toBe("Passwords do not match");
    }
  });

  it.each([
    ["short", "Ab3defg"],
    ["no uppercase", "abcdefghij3"],
    ["no lowercase", "ABCDEFGHIJ3"],
    ["no digit", "AbcdefghijK"],
  ])("rejects a password with %s", (_label, password) => {
    const parsed = signUpSchema.safeParse({
      ...valid,
      password,
      confirmPassword: password,
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects a password beyond the bcrypt input limit", () => {
    const password = `${"A1b".repeat(40)}`;
    expect(
      signUpSchema.safeParse({ ...valid, password, confirmPassword: password })
        .success,
    ).toBe(false);
  });
});

describe("password policy feedback", () => {
  it("reports each requirement independently", () => {
    expect(checkPassword("")).toEqual({
      length: false,
      lower: false,
      upper: false,
      number: false,
    });
    expect(checkPassword(STRONG)).toEqual({
      length: true,
      lower: true,
      upper: true,
      number: true,
    });
  });

  it("agrees with the stated minimum length", () => {
    expect(checkPassword("A1b".repeat(4)).length).toBe(
      "A1b".repeat(4).length >= PASSWORD_MIN_LENGTH,
    );
  });
});

describe("sign-in validation", () => {
  it("accepts any non-empty password", () => {
    // Deliberate: an existing account may predate a policy change, and
    // applying the policy here would leak the shape of the stored password.
    const parsed = signInSchema.safeParse({
      email: "ann@example.com",
      password: "x",
    });
    expect(parsed.success).toBe(true);
  });

  it("still requires a password to be present", () => {
    expect(
      signInSchema.safeParse({ email: "ann@example.com", password: "" })
        .success,
    ).toBe(false);
  });

  it("still requires a valid email", () => {
    expect(
      signInSchema.safeParse({ email: "nope", password: "x" }).success,
    ).toBe(false);
  });
});

describe("forgot-password validation", () => {
  it("requires a valid email", () => {
    expect(forgotPasswordSchema.safeParse({ email: "nope" }).success).toBe(
      false,
    );
    expect(
      forgotPasswordSchema.safeParse({ email: "ann@example.com" }).success,
    ).toBe(true);
  });
});

describe("reset-password validation", () => {
  it("applies the full policy to the new password", () => {
    expect(
      resetPasswordSchema.safeParse({
        password: "weak",
        confirmPassword: "weak",
      }).success,
    ).toBe(false);
  });

  it("requires the confirmation to match", () => {
    const parsed = resetPasswordSchema.safeParse({
      password: STRONG,
      confirmPassword: "Different1Pass",
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(
        parsed.error.issues.some((i) => i.path[0] === "confirmPassword"),
      ).toBe(true);
    }
  });

  it("accepts a matching, policy-compliant pair", () => {
    expect(
      resetPasswordSchema.safeParse({
        password: STRONG,
        confirmPassword: STRONG,
      }).success,
    ).toBe(true);
  });
});
