import { describe, expect, it } from "vitest";

import {
  DIRECTORY_CUSTOMERS,
  SETTINGS_USERS,
  TEAM,
  TEAM_WORKLOAD,
  WORKLOAD_TOTALS,
} from "@/lib/wireframes/mock-data";

/**
 * The admin dashboard's Team workload claims to list every active user who
 * can hold work. These tests hold it to that claim.
 */

describe("Team workload", () => {
  const listed = TEAM_WORKLOAD.map((r) => r.user);

  it("lists every active user, so none is silently omitted", () => {
    const active = SETTINGS_USERS.filter((u) => u.status === "Active").map(
      (u) => u.name,
    );
    expect([...listed].sort()).toEqual([...active].sort());
  });

  it("never lists invited or deactivated users as workload holders", () => {
    for (const user of SETTINGS_USERS.filter((u) => u.status !== "Active")) {
      expect(listed, user.name).not.toContain(user.name);
      expect(
        TEAM.map((t) => t.name),
        user.name,
      ).not.toContain(user.name);
    }
    expect(listed).not.toContain("Fathima Rasheed");
  });

  it("shows honest zeros for users with no assigned work", () => {
    for (const name of [
      "Divya Mohan",
      "Ajay Varma",
      "Nisha George",
      "Kavya Raghavan",
    ]) {
      const row = TEAM_WORKLOAD.find((r) => r.user === name);
      expect(row, name).toMatchObject({
        assignedLeads: 0,
        followUpsToday: 0,
        overdue: 0,
        renewals: 0,
      });
    }
  });

  it("keeps the existing holders' figures unchanged", () => {
    const pick = (name: string) => {
      const row = TEAM_WORKLOAD.find((r) => r.user === name)!;
      return [row.assignedLeads, row.followUpsToday, row.overdue, row.renewals];
    };
    expect(pick("Arun Menon")).toEqual([14, 4, 1, 7]);
    expect(pick("Sneha Thomas")).toEqual([11, 3, 0, 5]);
    expect(pick("Vikram Shah")).toEqual([9, 2, 2, 6]);
    expect(pick("Neha Thomas")).toEqual([7, 3, 2, 4]);
  });

  it("derives the dashboard cards from the same rows", () => {
    expect(WORKLOAD_TOTALS).toEqual({
      followUpsToday: 12,
      usersWithFollowUpsToday: 4,
      renewals: 22,
      overdue: 5,
    });
  });
});

describe("customer and workspace-user identities", () => {
  it("leaves the Customer named Fathima Rasheed unchanged", () => {
    const customer = DIRECTORY_CUSTOMERS.find((c) => c.id === "d688");
    expect(customer).toMatchObject({
      name: "Fathima Rasheed",
      reference: "Customer · #688",
      phone: "70000 24507",
      email: "fathima.rasheed@mail.example",
      product: "Motor Insurance",
      serviceCount: 3,
      policyRef: "POL-TEST-688-A",
      owner: "Sneha Thomas",
      renewal: "20 Aug 2027",
      renewalStatus: "Renewed",
    });
  });

  it("keeps the invited workspace user distinct from that Customer", () => {
    const user = SETTINGS_USERS.find((u) => u.name === "Fathima Rasheed");
    expect(user).toMatchObject({
      status: "Invited",
      email: "fathima@asfincare.example",
      assignedRecords: 0,
    });
  });
});
