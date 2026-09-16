/**
 * Sales Teams and team-scoped Lead round robin — wireframe data (spec §163).
 *
 * Data-only, like the rest of `src/lib/wireframes`: nothing here assigns a
 * Lead, stores a rotation position or reaches a database. The helpers below
 * only DESCRIBE the rules the specification sets, so the five Sales Team
 * screens and their tests read one model rather than five hand-typed copies.
 *
 * Every person is referenced by their `SETTINGS_USERS` id, never by a typed
 * name, so a team roster cannot drift from the Users screen.
 *
 * MEMBERSHIP MODEL (audited against SETTINGS_USERS):
 *
 *   Health Insurance Team    Sneha Thomas (Team Lead), Divya Mohan (paused),
 *                            Neha Thomas; Joseph Kurian — ended, deactivated
 *   Motor Insurance Team     Vikram Shah (Manager, Team Lead), Ajay Varma
 *   Life & Investments Team  Nisha George (Team Lead, paused by Owner/Admin)
 *
 *   Not in any team          Arun Menon (Owner/Admin), Kavya Raghavan (new,
 *                            active), Fathima Rasheed (invited, so not yet
 *                            eligible to join), Joseph Kurian (deactivated)
 *
 * Nothing here decides a question §163.18 leaves open: there is no routing
 * condition, no insertion rule for new members, no maximum Batch Size and no
 * behaviour for manual assignment or a reactivated team's rotation.
 */

import { SETTINGS_USERS, type SettingsUser } from "@/lib/wireframes/mock-data";

/* ----------------------------------------------------------------- labels */

export type Eligibility = "Eligible" | "Paused";

/** The only two labels §163.5 allows. Never "Available". */
export const ELIGIBILITY_LABEL: Record<Eligibility, string> = {
  Eligible: "Eligible for Lead assignment",
  Paused: "Paused from Lead assignment",
};

/**
 * Workspace role as the specification names it (§2, §159).
 *
 * Team Lead is deliberately absent: it is a responsibility inside one team,
 * shown beside the role, never instead of it.
 */
export function roleLabel(role: SettingsUser["role"]): string {
  switch (role) {
    case "Owner":
    case "Admin":
      return "Owner/Admin";
    case "Manager":
      return "Manager";
    case "Staff":
      return "Staff/Sales";
  }
}

/**
 * Decision 1 in §163.18 is open, so no screen names a routing condition.
 * One sentence, shared, so every screen says the same thing.
 */
export const ROUTING_TBC =
  "How incoming Leads select this rule will be confirmed with A&S Fincare.";

/** Presentation date for every "today" on these screens. */
export const TEAMS_TODAY = "11 Sep 2026";

/* ------------------------------------------------------------------ model */

export type EligibilityChange = {
  /** SETTINGS_USERS id of whoever made the change, or null for the default. */
  byUserId: string | null;
  /** How the change was made — a Team Lead control or an Owner/Admin override. */
  capacity: "Default on joining" | "Team Lead" | "Owner/Admin override";
  at: string;
};

export type Membership = {
  userId: string;
  status: "Active" | "Ended";
  teamLead: boolean;
  eligibility: Eligibility;
  joined: string;
  ended?: string;
  endedReason?: string;
  eligibilityChange: EligibilityChange;
};

export type TeamLeadHistory = {
  userId: string;
  from: string;
  /** Absent while the responsibility is current. */
  to?: string;
};

export type SalesTeam = {
  id: string;
  slug: string;
  name: string;
  description: string;
  status: "Active" | "Inactive";
  created: string;
  memberships: readonly Membership[];
  /**
   * The team's stable rotation order (§163.8), as user ids of ACTIVE members.
   * Every member here has belonged to the team since it was set up, so the
   * order implies nothing about where a newly added member would go — that
   * is decision 9.
   */
  rotationOrder: readonly string[];
  teamLeadHistory: readonly TeamLeadHistory[];
  /** Leads currently waiting in Assignment Required for this team (§163.9). */
  assignmentRequired: number;
  /** Only teams with a wireframe detail screen carry one. */
  detailHref?: "/wireframes/admin/teams/health-insurance";
};

export type LeadAssignmentRule = {
  id: string;
  slug: string;
  name: string;
  status: "Active" | "Inactive";
  /** Exactly one Sales Team (§163.7). */
  teamId: string;
  /** Fixed. §163.7 offers no other automatic method. */
  method: "Round Robin";
  /** Positive whole number; the V1 default is 1. */
  batchSize: number;
  /** The member the stored rotation position points past (§163.8). */
  lastAssignedUserId: string | null;
  updated: string;
  updatedByUserId: string;
  detailHref?: "/wireframes/admin/lead-assignment/health-insurance";
};

/* ------------------------------------------------------------------- data */

/**
 * Users who joined the workspace for the Sales Teams wireframes.
 *
 * Kept here as ids so the screens can name them; the records themselves live
 * in SETTINGS_USERS with everyone else.
 */
export const USER = {
  arun: "s1",
  vikram: "s2",
  sneha: "s3",
  neha: "s4",
  fathima: "s5",
  joseph: "s6",
  divya: "s7",
  ajay: "s8",
  nisha: "s9",
  kavya: "s10",
} as const;

export const SALES_TEAMS: readonly SalesTeam[] = [
  {
    id: "team-health",
    slug: "health-insurance",
    name: "Health Insurance Team",
    description: "Health insurance enquiries and new policies.",
    status: "Active",
    created: "01 Jul 2026",
    memberships: [
      {
        userId: USER.sneha,
        status: "Active",
        teamLead: true,
        eligibility: "Eligible",
        joined: "01 Jul 2026",
        eligibilityChange: {
          byUserId: null,
          capacity: "Default on joining",
          at: "01 Jul 2026",
        },
      },
      {
        userId: USER.divya,
        status: "Active",
        teamLead: false,
        eligibility: "Paused",
        joined: "01 Jul 2026",
        eligibilityChange: {
          byUserId: USER.sneha,
          capacity: "Team Lead",
          at: "10 Sep 2026",
        },
      },
      {
        userId: USER.neha,
        status: "Active",
        teamLead: false,
        eligibility: "Eligible",
        joined: "01 Jul 2026",
        eligibilityChange: {
          byUserId: null,
          capacity: "Default on joining",
          at: "01 Jul 2026",
        },
      },
      {
        // Historical only. Deactivating Joseph as a user ended this
        // membership; those Leads kept Joseph as their Record Owner.
        userId: USER.joseph,
        status: "Ended",
        teamLead: false,
        eligibility: "Paused",
        joined: "01 Jul 2026",
        ended: "14 Aug 2026",
        endedReason: "User deactivated",
        eligibilityChange: {
          byUserId: null,
          capacity: "Default on joining",
          at: "14 Aug 2026",
        },
      },
    ],
    rotationOrder: [USER.sneha, USER.divya, USER.neha],
    teamLeadHistory: [{ userId: USER.sneha, from: "01 Jul 2026" }],
    assignmentRequired: 0,
    detailHref: "/wireframes/admin/teams/health-insurance",
  },
  {
    id: "team-motor",
    slug: "motor-insurance",
    name: "Motor Insurance Team",
    description: "Motor insurance and vehicle policy enquiries.",
    status: "Active",
    created: "01 Jul 2026",
    memberships: [
      {
        // A Manager may lead a team and stays a Manager (§163.3). The Team
        // Lead responsibility is what places Vikram in this team's rotation.
        userId: USER.vikram,
        status: "Active",
        teamLead: true,
        eligibility: "Eligible",
        joined: "01 Jul 2026",
        eligibilityChange: {
          byUserId: null,
          capacity: "Default on joining",
          at: "01 Jul 2026",
        },
      },
      {
        userId: USER.ajay,
        status: "Active",
        teamLead: false,
        eligibility: "Eligible",
        joined: "01 Jul 2026",
        eligibilityChange: {
          byUserId: null,
          capacity: "Default on joining",
          at: "01 Jul 2026",
        },
      },
    ],
    rotationOrder: [USER.vikram, USER.ajay],
    teamLeadHistory: [{ userId: USER.vikram, from: "01 Jul 2026" }],
    assignmentRequired: 0,
  },
  {
    id: "team-life",
    slug: "life-investments",
    name: "Life & Investments Team",
    description: "Term life cover and mutual fund SIP enquiries.",
    status: "Active",
    created: "15 Jul 2026",
    memberships: [
      {
        userId: USER.nisha,
        status: "Active",
        teamLead: true,
        eligibility: "Paused",
        joined: "15 Jul 2026",
        eligibilityChange: {
          byUserId: USER.arun,
          capacity: "Owner/Admin override",
          at: "08 Sep 2026",
        },
      },
    ],
    rotationOrder: [USER.nisha],
    teamLeadHistory: [{ userId: USER.nisha, from: "15 Jul 2026" }],
    assignmentRequired: 3,
  },
];

export const LEAD_ASSIGNMENT_RULES: readonly LeadAssignmentRule[] = [
  {
    id: "rule-health",
    slug: "health-insurance",
    name: "Health Insurance Lead Assignment",
    status: "Active",
    teamId: "team-health",
    method: "Round Robin",
    batchSize: 1,
    lastAssignedUserId: USER.neha,
    updated: "02 Sep 2026",
    updatedByUserId: USER.arun,
    detailHref: "/wireframes/admin/lead-assignment/health-insurance",
  },
  {
    id: "rule-motor",
    slug: "motor-insurance",
    name: "Motor Insurance Lead Assignment",
    status: "Active",
    teamId: "team-motor",
    method: "Round Robin",
    batchSize: 5,
    lastAssignedUserId: USER.ajay,
    updated: "28 Aug 2026",
    updatedByUserId: USER.arun,
  },
  {
    id: "rule-life",
    slug: "life-investments",
    name: "Life & Investments Lead Assignment",
    status: "Active",
    teamId: "team-life",
    method: "Round Robin",
    batchSize: 1,
    lastAssignedUserId: USER.nisha,
    updated: "15 Jul 2026",
    updatedByUserId: USER.arun,
  },
  {
    id: "rule-motor-walk-in",
    slug: "motor-walk-in",
    name: "Motor Walk-in Lead Assignment",
    status: "Inactive",
    teamId: "team-motor",
    method: "Round Robin",
    batchSize: 1,
    lastAssignedUserId: USER.vikram,
    updated: "20 Aug 2026",
    updatedByUserId: USER.arun,
  },
];

/* ---------------------------------------------------------------- lookups */

export function userById(id: string): SettingsUser {
  const user = SETTINGS_USERS.find((u) => u.id === id);
  if (!user) throw new Error(`Unknown wireframe user: ${id}`);
  return user;
}

export function initialsOf(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0])
    .join("");
}

export function teamById(id: string): SalesTeam {
  const team = SALES_TEAMS.find((t) => t.id === id);
  if (!team) throw new Error(`Unknown wireframe team: ${id}`);
  return team;
}

export function teamBySlug(slug: string): SalesTeam {
  const team = SALES_TEAMS.find((t) => t.slug === slug);
  if (!team) throw new Error(`Unknown wireframe team: ${slug}`);
  return team;
}

export function ruleBySlug(slug: string): LeadAssignmentRule {
  const rule = LEAD_ASSIGNMENT_RULES.find((r) => r.slug === slug);
  if (!rule) throw new Error(`Unknown wireframe rule: ${slug}`);
  return rule;
}

export function activeMemberships(team: SalesTeam): readonly Membership[] {
  return team.memberships.filter((m) => m.status === "Active");
}

export function teamLeadOf(team: SalesTeam): Membership | undefined {
  return activeMemberships(team).find((m) => m.teamLead);
}

export function rulesTargeting(teamId: string): readonly LeadAssignmentRule[] {
  return LEAD_ASSIGNMENT_RULES.filter((r) => r.teamId === teamId);
}

/** The one active team a user belongs to, if any (§163.2). */
export function activeTeamOf(userId: string): SalesTeam | undefined {
  return SALES_TEAMS.find(
    (t) =>
      t.status === "Active" &&
      activeMemberships(t).some((m) => m.userId === userId),
  );
}

/** Current eligibility for each active member, keyed by user id. */
export type EligibilityMap = Readonly<Record<string, Eligibility>>;

export function eligibilityOf(team: SalesTeam): EligibilityMap {
  return Object.fromEntries(
    activeMemberships(team).map((m) => [m.userId, m.eligibility]),
  );
}

/**
 * Whether a member may receive Leads from this team at all (§163.8).
 *
 * Staff/Sales may. The team's active Team Lead may, whatever their role —
 * the responsibility satisfies the permission for their own team. Any other
 * role is "otherwise as permitted", which these wireframes do not settle, so
 * it is reported as not confirmed rather than assumed.
 */
export function mayReceiveLeads(member: Membership): boolean {
  if (member.teamLead) return true;
  return userById(member.userId).role === "Staff";
}

/**
 * The rotation pool for a team, in its stable rotation order (§163.8).
 *
 * Only this team's members are considered — there is no path by which a
 * member of another team, or the workspace at large, enters the pool.
 */
export function rotationPool(
  team: SalesTeam,
  eligibility: EligibilityMap = eligibilityOf(team),
): readonly string[] {
  if (team.status !== "Active") return [];
  const members = activeMemberships(team);
  return team.rotationOrder.filter((userId) => {
    const member = members.find((m) => m.userId === userId);
    if (!member) return false;
    if (userById(userId).status !== "Active") return false;
    if (!mayReceiveLeads(member)) return false;
    return eligibility[userId] === "Eligible";
  });
}

/**
 * Who the next `count` automatic Leads would go to, for a Batch Size of 1.
 *
 * Starts from the member after the stored position and walks the team's own
 * order, skipping anyone outside the pool. Pausing someone never moves the
 * stored position, and restoring someone gives them no priority: they are
 * reached only when the walk comes to their place in the order.
 *
 * Returns an empty list when the pool is empty — the caller shows Assignment
 * Required. There is no fallback.
 */
export function previewAssignments(
  order: readonly string[],
  pool: readonly string[],
  lastAssignedUserId: string | null,
  count: number,
): readonly string[] {
  if (pool.length === 0 || order.length === 0) return [];
  const inPool = new Set(pool);
  const start = lastAssignedUserId ? order.indexOf(lastAssignedUserId) : -1;
  const out: string[] = [];
  let i = start;
  while (out.length < count) {
    i = (i + 1) % order.length;
    const candidate = order[i]!;
    if (inPool.has(candidate)) out.push(candidate);
  }
  return out;
}

export type TeamCounts = {
  active: number;
  eligible: number;
  paused: number;
};

export function teamCounts(
  team: SalesTeam,
  eligibility: EligibilityMap = eligibilityOf(team),
): TeamCounts {
  const members = activeMemberships(team);
  const eligible = members.filter(
    (m) => eligibility[m.userId] === "Eligible",
  ).length;
  return {
    active: members.length,
    eligible,
    paused: members.length - eligible,
  };
}

/** The assignment warning §163.5 and §163.7 require, or null. */
export function teamWarning(
  team: SalesTeam,
  eligibility: EligibilityMap = eligibilityOf(team),
): string | null {
  if (team.status !== "Active") return "Team is inactive";
  if (rotationPool(team, eligibility).length === 0) {
    return "No eligible members";
  }
  return null;
}

export function ruleWarning(rule: LeadAssignmentRule): string | null {
  if (rule.status !== "Active") return null;
  return teamWarning(teamById(rule.teamId));
}

/**
 * Whether an inactive team may be activated (§163.1, §163.2, §163.3).
 *
 * Blocked unless the team has exactly one active Team Lead who is an active
 * user and an active member, every active member is an active user, and no
 * active member already holds an active membership of another team.
 * Activation never picks a Team Lead or changes anyone's eligibility.
 *
 * Zero eligible members does NOT block activation. It is reported instead:
 * the team would have no rotation pool, so its Leads would wait in
 * Assignment Required with no fallback.
 */
export type ActivationCheck = {
  blockers: readonly string[];
  eligibleCount: number;
};

export function activationCheck(
  teamId: string,
  members: readonly Membership[],
): ActivationCheck {
  const active = members.filter((m) => m.status === "Active");
  const blockers: string[] = [];

  const leads = active.filter((m) => m.teamLead);
  if (leads.length !== 1) {
    blockers.push(
      `A team needs exactly one active Team Lead to be activated. This team has ${leads.length}.`,
    );
  }

  for (const m of active) {
    const user = userById(m.userId);
    if (user.status !== "Active") {
      blockers.push(
        `${user.name} is not an active user${m.teamLead ? " and cannot remain Team Lead" : ""}. Only active users may hold active memberships.`,
      );
      continue;
    }
    const other = SALES_TEAMS.find(
      (t) =>
        t.id !== teamId &&
        t.status === "Active" &&
        activeMemberships(t).some((o) => o.userId === m.userId),
    );
    if (other) {
      blockers.push(
        `${user.name} already has an active membership of ${other.name}.`,
      );
    }
  }

  const eligibleCount = active.filter(
    (m) =>
      m.eligibility === "Eligible" &&
      userById(m.userId).status === "Active" &&
      mayReceiveLeads(m),
  ).length;

  return { blockers, eligibleCount };
}

/**
 * Users who could be added to a team, with the reason when they cannot.
 *
 * Adding never creates a user, never reactivates one, and never gives
 * anyone a second active team (§163.2, §163.12).
 */
export type Candidate = {
  user: SettingsUser;
  /** Null when the user can be added directly. */
  blocked: string | null;
  /** Set when the user is in another team and would need a transfer. */
  currentTeam?: SalesTeam;
};

export function addCandidates(teamId: string): readonly Candidate[] {
  return SETTINGS_USERS.map((user): Candidate | null => {
    const current = activeTeamOf(user.id);
    if (current?.id === teamId) return null;
    if (user.status === "Invited") {
      return {
        user,
        blocked:
          "Invitation not yet accepted. Only active users can join a team.",
      };
    }
    if (user.status === "Deactivated") {
      return {
        user,
        blocked:
          "Deactivated user. Reactivate them in Users first — joining a team never does it.",
      };
    }
    if (current) {
      return {
        user,
        currentTeam: current,
        blocked: `Already in ${current.name}. Use Transfer instead — one active team per person.`,
      };
    }
    return { user, blocked: null };
  }).filter((c): c is Candidate => c !== null);
}
