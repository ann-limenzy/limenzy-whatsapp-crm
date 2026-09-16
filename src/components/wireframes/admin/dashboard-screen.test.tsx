import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AdminDashboardScreen } from "@/components/wireframes/admin/dashboard-screen";
import {
  PIPELINE,
  PIPELINE_TOTALS,
  SETTINGS_USERS,
} from "@/lib/wireframes/mock-data";

/**
 * The admin dashboard must describe its Lead figures accurately: Won is a
 * terminal stage, so the pipeline total is not "open", and the per-person
 * figure is Leads assigned, not open Leads.
 */

describe("pipeline totals", () => {
  it("counts 41 Leads: 37 active and 4 Won", () => {
    expect(PIPELINE_TOTALS).toEqual({ total: 41, active: 37, won: 4 });
    expect(PIPELINE.find((p) => p.stage === "Won")?.count).toBe(4);
    expect(PIPELINE.find((p) => p.stage === "New")?.count).toBe(18);
  });
});

describe("AdminDashboardScreen", () => {
  it("summarises the pipeline without calling all 41 open", () => {
    const { container } = render(<AdminDashboardScreen />);
    const text = container.textContent ?? "";
    expect(text).toContain("41 leads across stages · 37 active · 4 won");
    expect(text).not.toMatch(/open leads?/i);
    expect(text).not.toMatch(/41 active/i);
  });

  it("labels the workload column Assigned Leads", () => {
    render(<AdminDashboardScreen />);
    const table = screen
      .getByRole("columnheader", { name: "Assigned Leads" })
      .closest("table")!;
    expect(
      within(table).queryByRole("columnheader", { name: /open/i }),
    ).toBeNull();
  });

  it("keeps New Leads at 18 and Renewals Due Soon at 22", () => {
    render(<AdminDashboardScreen />);
    expect(screen.getByText("New Leads").nextElementSibling).toHaveTextContent(
      "18",
    );
    expect(
      screen.getByText("Renewals Due Soon").nextElementSibling,
    ).toHaveTextContent("22");
  });

  it("lists no invited or deactivated user in Team workload", () => {
    render(<AdminDashboardScreen />);
    const table = screen
      .getByRole("columnheader", { name: "Assigned Leads" })
      .closest("table")!;
    const rows = within(table).getAllByRole("row").slice(1);
    const names = rows.map((r) => r.querySelector("td")?.textContent ?? "");
    for (const user of SETTINGS_USERS.filter((u) => u.status !== "Active")) {
      expect(
        names.some((n) => n.includes(user.name)),
        user.name,
      ).toBe(false);
    }
    expect(rows).toHaveLength(
      SETTINGS_USERS.filter((u) => u.status === "Active").length,
    );
  });
});
