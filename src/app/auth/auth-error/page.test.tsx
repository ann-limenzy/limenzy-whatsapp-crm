// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import AuthErrorPage from "./page";

/**
 * The failed-link screen.
 *
 * Two things it must get right. It offers the remedy that matches what the
 * link was for — a fresh confirmation email for a signup, a fresh reset link
 * for a password recovery — because offering the wrong one walks someone into
 * resetting the password of an account they have not confirmed yet. And it
 * treats `flow` as what it is: a value from a URL anyone can edit.
 */

const renderPage = async (params: Record<string, string>) =>
  render(
    await AuthErrorPage({
      searchParams: Promise.resolve(params),
    } as Parameters<typeof AuthErrorPage>[0]),
  );

const href = (name: RegExp) =>
  screen.getByRole("link", { name }).getAttribute("href");

describe("the remedy matches what the link was for", () => {
  it("offers a new confirmation email after a failed signup", async () => {
    await renderPage({ reason: "invalid_link", flow: "signup" });

    expect(href(/confirmation email/i)).toBe("/verify-email");
    // The wrong remedy must not be on the page at all.
    expect(screen.queryByRole("link", { name: /reset/i })).toBeNull();
  });

  it("offers a new reset link after a failed recovery", async () => {
    await renderPage({ reason: "expired_link", flow: "recovery" });

    expect(href(/reset link/i)).toBe("/forgot-password");
    expect(
      screen.queryByRole("link", { name: /confirmation email/i }),
    ).toBeNull();
  });

  it("offers both, clearly labelled, when the intent is unknown", async () => {
    await renderPage({ reason: "invalid_link" });

    expect(href(/confirming a new account/i)).toBe("/verify-email");
    expect(href(/resetting your password/i)).toBe("/forgot-password");
  });

  it("always offers a way back to sign in", async () => {
    const cases: Record<string, string>[] = [
      { reason: "invalid_link", flow: "signup" },
      { reason: "expired_link", flow: "recovery" },
      { reason: "invalid_link" },
    ];
    for (const params of cases) {
      const { unmount } = await renderPage(params);
      expect(href(/back to sign in/i)).toBe("/sign-in");
      unmount();
    }
  });
});

describe("flow arrives in a URL, so it is never trusted", () => {
  it.each([
    ["an unrecognised value", "admin"],
    ["an empty value", ""],
    ["a path", "/forgot-password"],
    ["an absolute URL", "https://evil.test"],
    ["a protocol-relative URL", "//evil.test"],
    ["a near-miss", "Signup"],
  ])("falls back to offering both for %s", async (_why, flow) => {
    await renderPage({ reason: "invalid_link", flow });

    // Unknown means unknown: both choices, and nothing taken from the input.
    expect(href(/confirming a new account/i)).toBe("/verify-email");
    expect(href(/resetting your password/i)).toBe("/forgot-password");
  });

  it("never renders a destination drawn from the query string", async () => {
    await renderPage({ reason: "invalid_link", flow: "https://evil.test" });

    for (const link of screen.getAllByRole("link")) {
      const destination = link.getAttribute("href") ?? "";
      expect(destination.startsWith("/")).toBe(true);
      expect(destination).not.toContain("evil.test");
    }
  });

  it("ignores a repeated parameter supplied as an array", async () => {
    await renderPage({
      reason: "invalid_link",
      flow: ["signup", "recovery"] as unknown as string,
    });

    expect(href(/confirming a new account/i)).toBe("/verify-email");
    expect(href(/resetting your password/i)).toBe("/forgot-password");
  });
});

describe("the reason is still explained without echoing anything", () => {
  it("names an invalid link", async () => {
    await renderPage({ reason: "invalid_link", flow: "signup" });
    expect(screen.getByText(/isn't valid/i)).toBeTruthy();
  });

  it("names an expired link", async () => {
    await renderPage({ reason: "expired_link", flow: "recovery" });
    expect(screen.getByText(/has expired/i)).toBeTruthy();
  });

  it("falls back for an unrecognised reason rather than echoing it", async () => {
    await renderPage({ reason: "<script>alert(1)</script>" });

    expect(screen.getByText(/couldn't complete that/i)).toBeTruthy();
    expect(document.body.textContent).not.toContain("script");
  });
});
