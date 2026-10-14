// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Chooser names.
 *
 * The contract being pinned: a name is read through the ordinary tenant
 * gateway, under a context this user's own membership produced, one workspace
 * at a time — because the policy grants `public.workspaces` only where the row
 * equals `app.workspace_id`. Anything unreadable is dropped rather than shown.
 */

const resolveWorkspaceChoices = vi.hoisted(() => vi.fn());
vi.mock("@/server/auth/workspace-context", () => ({ resolveWorkspaceChoices }));

const withTenant = vi.hoisted(() => vi.fn());
vi.mock("@/server/db/tenant", () => ({ withTenant }));

const { resolveNamedWorkspaceChoices, workspaceNameFor } =
  await import("@/server/auth/workspace-names");

const A = "2b2b2b2b-2222-4222-8222-2222222222bb";
const B = "3c3c3c3c-3333-4333-8333-3333333333cc";

const contextFor = (workspaceId: string) => ({ workspaceId, branded: true });

/** Drive `withTenant` as the gateway does: run the callback with a fake tx. */
const gatewayReturning = (
  rowsByWorkspace: Record<string, { name: string }[]>,
) =>
  withTenant.mockImplementation(
    async (context: { workspaceId: string }, fn: (tx: unknown) => unknown) =>
      fn(() => rowsByWorkspace[context.workspaceId] ?? []),
  );

afterEach(() => {
  vi.clearAllMocks();
});

describe("the read is scoped per workspace", () => {
  it("opens one authorised transaction per choice, with that choice's context", async () => {
    resolveWorkspaceChoices.mockResolvedValue({
      kind: "choices",
      choices: [
        { workspaceId: A, role: "owner_admin", context: contextFor(A) },
        { workspaceId: B, role: "staff_sales", context: contextFor(B) },
      ],
    });
    gatewayReturning({
      [A]: [{ name: "Alpha Insurance" }],
      [B]: [{ name: "Beta Services" }],
    });

    const result = await resolveNamedWorkspaceChoices();

    expect(withTenant).toHaveBeenCalledTimes(2);
    expect(withTenant.mock.calls[0]?.[0]).toEqual(contextFor(A));
    expect(withTenant.mock.calls[1]?.[0]).toEqual(contextFor(B));
    expect(result).toEqual({
      kind: "choices",
      choices: [
        { workspaceId: A, role: "owner_admin", name: "Alpha Insurance" },
        { workspaceId: B, role: "staff_sales", name: "Beta Services" },
      ],
    });
  });

  it("returns no context to its caller", async () => {
    resolveWorkspaceChoices.mockResolvedValue({
      kind: "choices",
      choices: [{ workspaceId: A, role: "manager", context: contextFor(A) }],
    });
    gatewayReturning({ [A]: [{ name: "Alpha Insurance" }] });

    const result = await resolveNamedWorkspaceChoices();
    const serialised = JSON.stringify(result);
    // The marker the fake context carries must not survive into the result.
    expect(serialised).not.toContain("branded");
    if (result.kind !== "choices") throw new Error("expected choices");
    expect(Object.keys(result.choices[0] ?? {}).sort()).toEqual([
      "name",
      "role",
      "workspaceId",
    ]);
  });
});

describe("choices that stop being readable", () => {
  it("drops a workspace whose row the policy no longer returns", async () => {
    resolveWorkspaceChoices.mockResolvedValue({
      kind: "choices",
      choices: [
        { workspaceId: A, role: "owner_admin", context: contextFor(A) },
        { workspaceId: B, role: "staff_sales", context: contextFor(B) },
      ],
    });
    // B was deactivated between resolution and this read: RLS yields no row.
    gatewayReturning({ [A]: [{ name: "Alpha Insurance" }], [B]: [] });

    const result = await resolveNamedWorkspaceChoices();
    expect(result).toEqual({
      kind: "choices",
      choices: [
        { workspaceId: A, role: "owner_admin", name: "Alpha Insurance" },
      ],
    });
    // Never offered as a selectable placeholder.
    expect(JSON.stringify(result)).not.toContain(B);
  });

  it("becomes access-unavailable when every choice drops", async () => {
    resolveWorkspaceChoices.mockResolvedValue({
      kind: "choices",
      choices: [
        { workspaceId: A, role: "owner_admin", context: contextFor(A) },
      ],
    });
    gatewayReturning({ [A]: [] });

    expect(await resolveNamedWorkspaceChoices()).toEqual({
      kind: "access_unavailable",
    });
  });

  it("lets a query failure propagate instead of shortening the list", async () => {
    resolveWorkspaceChoices.mockResolvedValue({
      kind: "choices",
      choices: [
        { workspaceId: A, role: "owner_admin", context: contextFor(A) },
      ],
    });
    withTenant.mockRejectedValue(new Error("connection terminated"));

    // An outage must never be rendered as "you have fewer workspaces".
    await expect(resolveNamedWorkspaceChoices()).rejects.toThrow();
  });
});

describe("states that are not choices pass straight through", () => {
  it.each(["unauthenticated", "onboarding_required", "access_unavailable"])(
    "forwards %s without reading any name",
    async (kind) => {
      resolveWorkspaceChoices.mockResolvedValue({ kind });
      expect(await resolveNamedWorkspaceChoices()).toEqual({ kind });
      expect(withTenant).not.toHaveBeenCalled();
    },
  );
});

describe("the current workspace's name", () => {
  it("reads it under the context it was given, and mints nothing", async () => {
    gatewayReturning({ [A]: [{ name: "Alpha Insurance" }] });
    expect(await workspaceNameFor(contextFor(A) as never)).toBe(
      "Alpha Insurance",
    );
    expect(withTenant).toHaveBeenCalledWith(
      contextFor(A),
      expect.any(Function),
    );
  });

  it("is null when the row is not readable", async () => {
    gatewayReturning({ [A]: [] });
    expect(await workspaceNameFor(contextFor(A) as never)).toBeNull();
  });

  it("uses no tooling connection or privileged path", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = (
      await readFile("src/server/auth/workspace-names.ts", "utf8")
    )
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");

    for (const forbidden of [
      "DRIZZLE_TOOLING_DATABASE_URL",
      "service_role",
      "SUPABASE_SECRET_KEY",
      "createTenantContext",
      "runtimeSql",
      "security definer",
    ]) {
      expect(`${forbidden}: ${source.includes(forbidden)}`).toBe(
        `${forbidden}: false`,
      );
    }
  });
});
