import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Older §39 timeline entries — the gates — spec §27, §30, §39, §162.1.
 *
 * A Server Action is reachable by anyone who can POST to it, so these ask
 * what happens when someone calls this one who should not: with Leads
 * switched off, with a lead id that is not one, and with a cursor that is not
 * a moment. §162.1 itself is answered from the other side, against a real
 * database, in `src/server/db/lead-pagination.db.test.ts` — a mocked gateway
 * cannot prove a row-level policy.
 *
 * The one thing tested here that only a double can show: that the cursor is
 * passed through UNCHANGED. Converting it on the way past would round its
 * microseconds off and silently skip entries, and the gateway would have no
 * way to tell that had happened.
 */

const requireWorkspaceContext = vi.hoisted(() => vi.fn());
vi.mock("@/server/auth/require-workspace", () => ({ requireWorkspaceContext }));

const enabledModulesFor = vi.hoisted(() => vi.fn());
vi.mock("@/server/auth/workspace-modules", () => ({ enabledModulesFor }));

const gateway = vi.hoisted(() => ({
  leadActivityPage: vi.fn(),
  recordOwnerNames: vi.fn(),
}));
vi.mock("@/server/auth/workspace-leads", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/auth/workspace-leads")>()),
  ...gateway,
}));

const workspaceTimeZone = vi.hoisted(() => vi.fn());
vi.mock("@/server/auth/workspace-business-settings", () => ({
  workspaceTimeZone,
}));

process.env.DATABASE_URL ||=
  "postgresql://limenzy_app:test@127.0.0.1:54322/postgres";

const { olderLeadActivity } = await import("./lead-activity");

const LEAD = "11111111-1111-4111-8111-111111111111";
const ACTOR = "22222222-2222-4222-8222-222222222222";
const ENTRY = "33333333-3333-4333-8333-333333333333";
/* As PostgreSQL renders it — microseconds and all. */
const KEY = "2026-10-19 10:04:07.123456+00";

const CURSOR = { occurredAt: KEY, id: ENTRY };

function allowed() {
  requireWorkspaceContext.mockResolvedValue({
    context: { workspaceId: "ws", userProfileId: ACTOR },
    role: "owner_admin",
    workspaceId: "ws",
  });
  enabledModulesFor.mockResolvedValue({ enabled: new Set(["leads"]) });
  recordOwnerNamesReturns(new Map([[ACTOR, "Ann Sebastian"]]));
  workspaceTimeZone.mockResolvedValue("Asia/Kolkata");
  gateway.leadActivityPage.mockResolvedValue({
    entries: [],
    hasMore: false,
    nextCursor: null,
  });
}

function recordOwnerNamesReturns(names: Map<string, string>) {
  gateway.recordOwnerNames.mockResolvedValue(names);
}

beforeEach(() => {
  vi.clearAllMocks();
  allowed();
});

describe("olderLeadActivity", () => {
  it("reads nothing when the Leads module is off", async () => {
    enabledModulesFor.mockResolvedValue({ enabled: new Set(["whatsapp"]) });

    const result = await olderLeadActivity({ leadId: LEAD, before: CURSOR });

    expect(result).toEqual({ status: "unavailable" });
    expect(gateway.leadActivityPage).not.toHaveBeenCalled();
  });

  it("refuses a lead id that is not one, before any read", async () => {
    const result = await olderLeadActivity({
      leadId: "not-a-uuid",
      before: CURSOR,
    });

    expect(result).toEqual({ status: "unavailable" });
    expect(requireWorkspaceContext).not.toHaveBeenCalled();
    expect(gateway.leadActivityPage).not.toHaveBeenCalled();
  });

  it("refuses a cursor that is not an entry id", async () => {
    const result = await olderLeadActivity({
      leadId: LEAD,
      before: { occurredAt: KEY, id: "../../etc/passwd" },
    });

    expect(result).toEqual({ status: "unavailable" });
    expect(gateway.leadActivityPage).not.toHaveBeenCalled();
  });

  it("refuses a cursor whose moment is not a moment", async () => {
    for (const occurredAt of ["", "yesterday", "x".repeat(200)]) {
      const result = await olderLeadActivity({
        leadId: LEAD,
        before: { occurredAt, id: ENTRY },
      });
      expect(result).toEqual({ status: "unavailable" });
    }
    expect(gateway.leadActivityPage).not.toHaveBeenCalled();
  });

  it("passes the cursor through exactly as given", async () => {
    await olderLeadActivity({ leadId: LEAD, before: CURSOR });

    expect(gateway.leadActivityPage).toHaveBeenCalledWith(
      expect.anything(),
      LEAD,
      { before: { occurredAt: KEY, id: ENTRY } },
    );
    /*
     * The microseconds specifically. A `Date` round trip would hand the
     * gateway `…123000`, and every entry written in that 456-microsecond
     * window would be skipped on this page and never appear on another.
     */
    const [, , options] = gateway.leadActivityPage.mock.calls[0]!;
    expect(
      (options as { before: { occurredAt: string } }).before.occurredAt,
    ).toBe(KEY);
  });

  it("words each entry the way the first page does", async () => {
    gateway.leadActivityPage.mockResolvedValue({
      entries: [
        {
          id: ENTRY,
          kind: "note_added",
          actorUserProfileId: ACTOR,
          fromStageName: null,
          toStageName: null,
          changedFields: null,
          fromOwnerUserProfileId: null,
          toOwnerUserProfileId: null,
          note: "Called, no answer",
          lostReason: null,
          occurredAt: new Date("2026-10-19T10:04:07.123Z"),
        },
      ],
      hasMore: true,
      nextCursor: { occurredAt: KEY, id: ENTRY },
    });

    const result = await olderLeadActivity({ leadId: LEAD, before: CURSOR });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.lines[0]).toMatchObject({
      id: ENTRY,
      headline: "Ann Sebastian added a note",
      detail: "Called, no answer",
    });
    // Stamped in the workspace's §158 zone, not the reader's.
    expect(result.lines[0]!.when).toEqual(expect.any(String));
    expect(result.nextCursor).toEqual({ occurredAt: KEY, id: ENTRY });
  });

  it("names an unseen colleague without describing them", async () => {
    /*
     * §162.1 decides which names this reader is given at all. An id with no
     * name is a colleague they may not see, and the line says so rather than
     * leaking an identifier into the screen.
     */
    recordOwnerNamesReturns(new Map());
    gateway.leadActivityPage.mockResolvedValue({
      entries: [
        {
          id: ENTRY,
          kind: "record_created",
          actorUserProfileId: "44444444-4444-4444-8444-444444444444",
          fromStageName: null,
          toStageName: null,
          changedFields: null,
          fromOwnerUserProfileId: null,
          toOwnerUserProfileId: null,
          note: null,
          lostReason: null,
          occurredAt: new Date("2026-10-19T10:04:07.123Z"),
        },
      ],
      hasMore: false,
      nextCursor: null,
    });

    const result = await olderLeadActivity({ leadId: LEAD, before: CURSOR });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.lines[0]!.headline).toBe("Lead created by a team member");
    expect(result.lines[0]!.headline).not.toContain("4444");
  });
});
