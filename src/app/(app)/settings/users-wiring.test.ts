import { describe, expect, it } from "vitest";

/**
 * How the Users section is wired — spec §159.
 *
 * Structural, deliberately. The ordering it checks is the whole of the
 * safety argument for holding a project-wide Auth credential: authorise,
 * then ask the workspace-scoped routine, then look up only the ids it
 * returned, for only the page being shown. A unit test with everything
 * mocked would assert that the mocks were called; this asserts the source
 * cannot be read any other way.
 */

async function codeOf(path: string): Promise<string> {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(path, "utf8");
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const PAGE = "src/app/(app)/settings/page.tsx";
const LIST = "src/components/settings/user-settings-list.tsx";

describe("the order the page does things in", () => {
  it("authorises, then reads members, then looks addresses up", async () => {
    const code = await codeOf(PAGE);
    const authorise = code.indexOf('action: "manage_users"');
    const members = code.indexOf("workspaceMembers(context)");
    const lookup = code.indexOf("emailsForAuthUsers(");

    expect(authorise).toBeGreaterThan(-1);
    expect(members).toBeGreaterThan(authorise);
    expect(lookup).toBeGreaterThan(members);
  });

  it("looks nothing up unless manage_users was granted", async () => {
    const code = await codeOf(PAGE);
    // The lookup is guarded by the same flag that decides the section renders,
    // so an unauthorised request never reaches the credential at all.
    expect(code).toMatch(
      /mayManageUsers\s*\n?\s*\?\s*await emailsForAuthUsers\(/,
    );
  });

  it("passes only ids that came from the routine", async () => {
    const code = await codeOf(PAGE);
    // The argument is derived from pageMembers, which is a slice of
    // workspaceMembers(context). No other source of ids appears.
    expect(code).toMatch(
      /emailsForAuthUsers\(\s*pageMembers\s*\n?\s*\.map\(\(member\) => member\.authUserId\)/,
    );
    expect(code).not.toMatch(/emailsForAuthUsers\(\s*\[/);
  });

  it("looks up only the displayed page", async () => {
    const code = await codeOf(PAGE);
    expect(code).toContain("pageOf(");
    // allMembers is the full list; the lookup must take the page, not it.
    expect(code).not.toMatch(/emailsForAuthUsers\(\s*allMembers/);
  });
});

describe("what crosses to the browser", () => {
  it("never hands the client an auth user id", async () => {
    const code = await codeOf(PAGE);
    const rows = code.slice(
      code.indexOf("const rows ="),
      code.indexOf("return ("),
    );
    // The row shape the client receives is built explicitly. authUserId is
    // read inside it to resolve the address and is not copied out.
    expect(rows).toContain("userProfileId");
    expect(rows).toContain("email");
    expect(rows).not.toMatch(/authUserId:/);
  });

  it("keeps the client component free of the auth identifier", async () => {
    const code = await codeOf(LIST);
    expect(code).not.toContain("authUserId");
  });

  it("keeps the client component out of the server-only Auth module", async () => {
    const code = await codeOf(LIST);
    expect(code).not.toContain("@/server/auth/member-emails");
    expect(code).not.toContain("SUPABASE_SECRET_KEY");
  });
});

describe("no cross-request caching on this path", () => {
  it("caches nothing in the page or the helper", async () => {
    for (const path of [PAGE, "src/server/auth/member-emails.ts"]) {
      const code = await codeOf(path);
      // A cached privileged result would outlive the authorisation that
      // justified reading it.
      for (const forbidden of [
        "unstable_cache",
        "revalidate",
        "next: {",
        "force-cache",
      ]) {
        expect(`${path} ${forbidden}: ${code.includes(forbidden)}`).toBe(
          `${path} ${forbidden}: false`,
        );
      }
    }
  });
});
