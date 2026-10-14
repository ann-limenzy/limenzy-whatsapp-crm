import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Direct-route enforcement for a disabled module — spec §171, §172.
 *
 * §171 says disabling a module "hides its normal navigation and entry points",
 * but a link that is not rendered is still a URL anyone can type. These tests
 * are about the half that matters: what happens when someone types it.
 */

class NotFoundError extends Error {
  constructor() {
    super("NEXT_NOT_FOUND");
  }
}

const notFound = vi.hoisted(() =>
  vi.fn(() => {
    throw new NotFoundError();
  }),
);
vi.mock("next/navigation", () => ({ notFound }));

const requireWorkspaceContext = vi.hoisted(() => vi.fn());
vi.mock("./require-workspace", () => ({ requireWorkspaceContext }));

const enabledModulesFor = vi.hoisted(() => vi.fn());
vi.mock("./workspace-modules", () => ({ enabledModulesFor }));

import type { ModuleKey } from "@/lib/modules";

const { requireModule, requireFollowUpsModule } =
  await import("./require-module");
const { MODULE_KEYS } = await import("@/lib/modules");

const ACCESS = {
  context: { workspaceId: "w" },
  role: "owner_admin",
  workspaceId: "w",
};

const withEnabled = (...keys: ModuleKey[]) =>
  enabledModulesFor.mockResolvedValue({
    enabled: new Set(keys),
    usingDefaults: false,
  });

beforeEach(() => {
  vi.clearAllMocks();
  requireWorkspaceContext.mockResolvedValue(ACCESS);
});

describe("a disabled module is not reachable by URL", () => {
  it.each(["leads", "renewals_reminders", "whatsapp"] as ModuleKey[])(
    "refuses %s when it is disabled",
    async (module) => {
      withEnabled(...MODULE_KEYS.filter((key) => key !== module));

      await expect(requireModule(module)).rejects.toBeInstanceOf(NotFoundError);
      expect(notFound).toHaveBeenCalledTimes(1);
    },
  );

  it("allows the module when it is enabled", async () => {
    withEnabled(...MODULE_KEYS);

    await expect(requireModule("leads")).resolves.toBe(ACCESS);
    expect(notFound).not.toHaveBeenCalled();
  });

  it("resolves the workspace BEFORE deciding, so an anonymous visitor is not told which modules exist", async () => {
    requireWorkspaceContext.mockRejectedValue(new Error("redirect to sign-in"));

    await expect(requireModule("leads")).rejects.toThrow();
    // The module configuration was never read, so nothing about this workspace
    // leaked to someone who is not in it.
    expect(enabledModulesFor).not.toHaveBeenCalled();
  });

  it("reads the configuration for the resolved context, not a supplied one", async () => {
    withEnabled(...MODULE_KEYS);
    await requireModule("whatsapp");

    expect(enabledModulesFor).toHaveBeenCalledWith(ACCESS.context);
  });

  it("refuses when the workspace has disabled everything switchable", async () => {
    withEnabled();

    await expect(requireModule("leads")).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("Follow-ups follows the two-source rule (§43)", () => {
  it("stays reachable while Leads is enabled, even without Customer Follow-ups", async () => {
    withEnabled("leads");
    await expect(requireFollowUpsModule()).resolves.toBe(ACCESS);
  });

  it("stays reachable while Customer Follow-ups is enabled, even without Leads", async () => {
    withEnabled("customer_followups");
    await expect(requireFollowUpsModule()).resolves.toBe(ACCESS);
  });

  it("is refused only when neither source is enabled", async () => {
    withEnabled("whatsapp", "email");
    await expect(requireFollowUpsModule()).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});
