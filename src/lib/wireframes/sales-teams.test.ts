import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { FLOWS } from "@/lib/wireframes/flows";
import {
  SALES_PERSONA,
  SETTINGS_USERS,
  TEAM,
} from "@/lib/wireframes/mock-data";
import {
  ELIGIBILITY_LABEL,
  LEAD_ASSIGNMENT_RULES,
  SALES_TEAMS,
  USER,
  activationCheck,
  activeMemberships,
  activeTeamOf,
  addCandidates,
  eligibilityOf,
  previewAssignments,
  roleLabel,
  rotationPool,
  ruleWarning,
  teamById,
  teamBySlug,
  teamLeadOf,
  teamWarning,
  userById,
} from "@/lib/wireframes/sales-teams";

/**
 * The Sales Teams wireframes present rules from spec §163 as fact, so the
 * sample data must obey those rules. These tests are the audit.
 */

/** Source without comment lines — comments may quote forbidden wording. */
function codeOnly(source: string): string {
  return source
    .split("\n")
    .filter((line) => !/^\s*(\/\/|\/\*|\*)/.test(line))
    .join("\n");
}

const health = teamBySlug("health-insurance");
const motor = teamBySlug("motor-insurance");
const life = teamBySlug("life-investments");

describe("Sales Team membership (§163.2, §163.3)", () => {
  it("never gives a user two active team memberships", () => {
    const seen = new Map<string, string>();
    for (const team of SALES_TEAMS) {
      for (const m of activeMemberships(team)) {
        expect(seen.get(m.userId), `${m.userId} in two teams`).toBeUndefined();
        seen.set(m.userId, team.id);
      }
    }
  });

  it("gives every active team exactly one active Team Lead who is an active member", () => {
    for (const team of SALES_TEAMS.filter((t) => t.status === "Active")) {
      const leads = activeMemberships(team).filter((m) => m.teamLead);
      expect(leads, team.name).toHaveLength(1);
      expect(userById(leads[0]!.userId).status).toBe("Active");
    }
  });

  it("lets only active users hold active Sales Team memberships; ended memberships remain in history", () => {
    for (const team of SALES_TEAMS) {
      for (const m of activeMemberships(team)) {
        expect(userById(m.userId).status, m.userId).toBe("Active");
      }
    }
  });

  it("keeps Joseph Kurian's ended membership as history without making Joseph eligible", () => {
    const joseph = health.memberships.find((m) => m.userId === USER.joseph);
    expect(joseph?.status).toBe("Ended");
    expect(joseph?.ended).toBe("14 Aug 2026");
    expect(userById(USER.joseph).status).toBe("Deactivated");
    expect(activeTeamOf(USER.joseph)).toBeUndefined();
    expect(Object.keys(eligibilityOf(health))).not.toContain(USER.joseph);
    expect(rotationPool(health)).not.toContain(USER.joseph);
  });

  it("gives inactive and invited users no active membership anywhere", () => {
    for (const user of SETTINGS_USERS.filter((u) => u.status !== "Active")) {
      expect(activeTeamOf(user.id), user.name).toBeUndefined();
      for (const team of SALES_TEAMS) {
        expect(
          activeMemberships(team).map((m) => m.userId),
          user.name,
        ).not.toContain(user.id);
      }
    }
  });

  it("keeps Sneha a Sales Executive with a Team Lead responsibility", () => {
    expect(SALES_PERSONA.name).toBe("Sneha Thomas");
    expect(SALES_PERSONA.role).toBe("Sales Executive");
    expect(userById(USER.sneha).role).toBe("Staff");
    expect(teamLeadOf(health)?.userId).toBe(USER.sneha);
  });

  it("keeps Team Lead a responsibility, never a workspace role", () => {
    for (const user of SETTINGS_USERS) {
      expect(roleLabel(user.role)).not.toMatch(/team lead/i);
    }
    expect(userById(USER.sneha).role).toBe("Staff");
    expect(userById(USER.vikram).role).toBe("Manager");
    expect(teamLeadOf(health)?.userId).toBe(USER.sneha);
    expect(teamLeadOf(motor)?.userId).toBe(USER.vikram);
  });

  it("offers only active users as assignees", () => {
    const settingsActive = SETTINGS_USERS.filter(
      (u) => u.status === "Active",
    ).map((u) => u.name);
    expect(TEAM.map((t) => t.name).sort()).toEqual([...settingsActive].sort());
  });
});

describe("team activation (§163.1–163.3)", () => {
  const members = activeMemberships(health);

  it("allows the Health Insurance Team as it stands", () => {
    expect(activationCheck(health.id, members).blockers).toEqual([]);
  });

  it("refuses activation without exactly one active Team Lead", () => {
    const none = members.map((m) => ({ ...m, teamLead: false }));
    expect(activationCheck(health.id, none).blockers[0]).toMatch(
      /exactly one active Team Lead.*has 0/,
    );
    const two = members.map((m) => ({
      ...m,
      teamLead: m.userId !== USER.divya,
    }));
    expect(activationCheck(health.id, two).blockers[0]).toMatch(/has 2/);
  });

  it("refuses a Team Lead or member who is not an active user", () => {
    const withJoseph = [
      ...members.map((m) => ({ ...m, teamLead: false })),
      { ...members[0]!, userId: USER.joseph, teamLead: true },
    ];
    expect(activationCheck(health.id, withJoseph).blockers.join()).toMatch(
      /Joseph Kurian is not an active user and cannot remain Team Lead/,
    );
  });

  it("refuses a member who already has another active team", () => {
    const withAjay = [...members, { ...members[2]!, userId: USER.ajay }];
    expect(activationCheck(health.id, withAjay).blockers).toEqual([
      "Ajay Varma already has an active membership of Motor Insurance Team.",
    ]);
  });

  it("allows zero eligible members, but reports an empty pool", () => {
    const allPaused = members.map((m) => ({
      ...m,
      eligibility: "Paused" as const,
    }));
    const check = activationCheck(health.id, allPaused);
    expect(check.blockers).toEqual([]);
    expect(check.eligibleCount).toBe(0);
  });

  it("never selects a Team Lead or changes eligibility", () => {
    const before = JSON.stringify(members);
    activationCheck(health.id, members);
    expect(JSON.stringify(members)).toBe(before);
  });
});

describe("rotation pool (§163.5, §163.8)", () => {
  it("lets an active team have zero eligible members with an empty pool", () => {
    expect(life.status).toBe("Active");
    expect(teamLeadOf(life)?.userId).toBe(USER.nisha);
    expect(rotationPool(life)).toEqual([]);
    expect(
      previewAssignments(life.rotationOrder, rotationPool(life), null, 3),
    ).toEqual([]);
    expect(life.assignmentRequired).toBeGreaterThan(0);
  });

  it("stops the pool of an inactive team", () => {
    expect(rotationPool({ ...health, status: "Inactive" })).toEqual([]);
    expect(teamWarning({ ...health, status: "Inactive" })).toBe(
      "Team is inactive",
    );
  });

  it("includes the Team Lead by default, whatever their role", () => {
    expect(rotationPool(health)).toContain(USER.sneha);
    expect(rotationPool(motor)).toContain(USER.vikram);
  });

  it("excludes paused members", () => {
    expect(rotationPool(health)).not.toContain(USER.divya);
    expect(rotationPool(health)).toEqual([USER.sneha, USER.neha]);
  });

  it("draws only on the team's own members", () => {
    for (const team of SALES_TEAMS) {
      const members = activeMemberships(team).map((m) => m.userId);
      for (const id of rotationPool(team)) expect(members).toContain(id);
    }
  });

  it("previews the next Leads from the stored position, inside the team", () => {
    const rule = LEAD_ASSIGNMENT_RULES.find((r) => r.teamId === health.id)!;
    expect(rule.lastAssignedUserId).toBe(USER.neha);
    expect(
      previewAssignments(
        health.rotationOrder,
        rotationPool(health),
        rule.lastAssignedUserId,
        4,
      ),
    ).toEqual([USER.sneha, USER.neha, USER.sneha, USER.neha]);
  });

  it("gives a restored member no priority", () => {
    const restored = {
      ...eligibilityOf(health),
      [USER.divya]: "Eligible" as const,
    };
    expect(
      previewAssignments(
        health.rotationOrder,
        rotationPool(health, restored),
        USER.neha,
        3,
      ),
    ).toEqual([USER.sneha, USER.divya, USER.neha]);
  });

  it("assigns nobody — no fallback — when no member is eligible", () => {
    const allPaused = Object.fromEntries(
      Object.keys(eligibilityOf(health)).map((id) => [id, "Paused" as const]),
    );
    expect(rotationPool(health, allPaused)).toEqual([]);
    expect(previewAssignments(health.rotationOrder, [], USER.neha, 4)).toEqual(
      [],
    );
    expect(teamWarning(health, allPaused)).toBe("No eligible members");
  });
});

describe("Lead assignment rules (§163.7)", () => {
  it("targets exactly one existing team with round robin and a positive whole Batch Size", () => {
    for (const rule of LEAD_ASSIGNMENT_RULES) {
      expect(() => teamById(rule.teamId)).not.toThrow();
      expect(rule.method).toBe("Round Robin");
      expect(Number.isInteger(rule.batchSize)).toBe(true);
      expect(rule.batchSize).toBeGreaterThanOrEqual(1);
    }
  });

  it("uses the default Batch Size of 1 on the presented rule", () => {
    const rule = LEAD_ASSIGNMENT_RULES.find(
      (r) => r.slug === "health-insurance",
    );
    expect(rule?.batchSize).toBe(1);
  });

  it("flags a team with no eligible members, and its active rule", () => {
    expect(teamWarning(life)).toBe("No eligible members");
    const lifeRule = LEAD_ASSIGNMENT_RULES.find((r) => r.teamId === life.id)!;
    expect(ruleWarning(lifeRule)).toBe("No eligible members");
    expect(teamWarning(health)).toBeNull();
    expect(teamWarning(motor)).toBeNull();
  });

  it("never warns about an inactive rule", () => {
    for (const rule of LEAD_ASSIGNMENT_RULES.filter(
      (r) => r.status === "Inactive",
    )) {
      expect(ruleWarning(rule)).toBeNull();
    }
  });
});

describe("adding members (§163.2, §163.12)", () => {
  const candidates = addCandidates(health.id);
  const reason = (id: string) =>
    candidates.find((c) => c.user.id === id)?.blocked;

  it("allows an active user with no team", () => {
    expect(reason(USER.kavya)).toBeNull();
  });

  it("refuses invited, deactivated and already-assigned users", () => {
    expect(reason(USER.fathima)).toMatch(/not yet accepted/);
    expect(reason(USER.joseph)).toMatch(/Deactivated/);
    expect(reason(USER.ajay)).toMatch(/Already in Motor Insurance Team/);
  });

  it("does not offer the team's own members", () => {
    expect(candidates.map((c) => c.user.id)).not.toContain(USER.sneha);
  });
});

describe("wording (§163.5)", () => {
  it("uses the two approved eligibility labels", () => {
    expect(ELIGIBILITY_LABEL).toEqual({
      Eligible: "Eligible for Lead assignment",
      Paused: "Paused from Lead assignment",
    });
  });

  it("never labels eligibility as Available", () => {
    for (const file of [
      "src/components/wireframes/admin/sales-teams-screen.tsx",
      "src/components/wireframes/admin/sales-team-detail-screen.tsx",
      "src/components/wireframes/admin/lead-assignment-rules-screen.tsx",
      "src/components/wireframes/admin/lead-assignment-rule-screen.tsx",
      "src/components/wireframes/teams/my-team-mobile.tsx",
      "src/components/wireframes/teams/team-parts.tsx",
    ]) {
      expect(codeOnly(readFileSync(file, "utf8")), file).not.toMatch(
        /\bAvailable\b/,
      );
    }
  });
});

describe("flow registry", () => {
  it("registers the five Sales Team screens as one flow", () => {
    const flow = FLOWS.find((f) => f.id === "sales-teams");
    expect(flow?.name).toBe("Sales Teams and Lead Assignment");
    expect(flow?.steps.map((s) => s.href)).toEqual([
      "/wireframes/admin/teams",
      "/wireframes/admin/teams/health-insurance",
      "/wireframes/admin/lead-assignment",
      "/wireframes/admin/lead-assignment/health-insurance",
      "/wireframes/teams/my-team",
    ]);
  });
});
