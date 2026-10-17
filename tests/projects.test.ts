import { describe, expect, it } from "vitest";
import type { Assignment, ExpectedTeam, Project, Resource, StatusUpdate } from "@/lib/domain";
import { deliveryHealth, filterProjects, isStale, latestUpdates, marginPct, slippageDays, teamCoverage } from "@/lib/projects";

const project = (p: Partial<Project> = {}): Project => ({
  project_id: "P001",
  project_name: "Claims",
  data_issues: "",
  project_type: "Client",
  client_name: "Acme",
  project_lead_email: "omar@firm.com",
  start_date: "2026-07-01",
  planned_end_date: "2026-12-31",
  forecast_end_date: "",
  status: "On track",
  progress_pct: 40,
  currency: "USD",
  project_value: 100,
  project_cost: 70,
  actual_cost_to_date: null,
  margin_pct: null,
  plan_link: "",
  charter_link: "",
  contract_link: "",
  stakeholder_map_link: "",
  source_opportunity_id: "",
  is_draft: 0,
  ...p,
});

const update = (week_start: string, project_id = "P001"): StatusUpdate => ({
  project_id,
  week_start,
  status: "On track",
  progress_pct: 10,
  summary: "ok",
  key_risks_issues: "",
  next_steps: "",
  updated_by: "omar@firm.com",
});

describe("project financials and dates", () => {
  it("calculates margin unless it was entered", () => {
    expect(marginPct(project())).toBe(30);
    expect(marginPct(project({ margin_pct: 32 }))).toBe(32);
    expect(marginPct(project({ project_cost: null }))).toBeNull();
    expect(marginPct(project({ project_value: 0 }))).toBeNull();
  });

  it("measures slippage as forecast past planned end", () => {
    expect(slippageDays(project({ forecast_end_date: "2027-01-31" }))).toBe(31);
    expect(slippageDays(project({ forecast_end_date: "2026-12-01" }))).toBe(0);
    expect(slippageDays(project())).toBe(0);
  });
});

describe("weekly updates", () => {
  it("finds the latest update per project", () => {
    const m = latestUpdates([update("2026-09-28"), update("2026-10-05"), update("2026-09-21", "P002")]);
    expect(m.get("P001")?.week_start).toBe("2026-10-05");
    expect(m.get("P002")?.week_start).toBe("2026-09-21");
  });

  it("flags an update as stale once its week ended more than N days ago", () => {
    const s = { stale_update_days: 7 };
    // week of 2026-10-05 ends 2026-10-11
    expect(isStale(project(), update("2026-10-05"), s, "2026-10-18")).toBe(false);
    expect(isStale(project(), update("2026-10-05"), s, "2026-10-19")).toBe(true);
    expect(isStale(project(), undefined, s, "2026-10-14")).toBe(true);
    expect(isStale(project({ start_date: "2026-11-01" }), undefined, s, "2026-10-14")).toBe(false);
    expect(isStale(project({ status: "Completed" }), undefined, s, "2026-10-14")).toBe(false);
  });
});

describe("delivery health", () => {
  it("is Red with any active project off track, Amber with any at risk", () => {
    expect(deliveryHealth([project(), project({ status: "At risk" })]).rag).toBe("Amber");
    expect(deliveryHealth([project({ status: "Off track" }), project({ status: "At risk" })]).rag).toBe("Red");
    expect(deliveryHealth([project(), project({ status: "Off track", is_draft: 1 })]).rag).toBe("Green");
    expect(deliveryHealth([project({ status: "Completed" })]).reason).toBe("No active projects");
  });
});

describe("team coverage", () => {
  const resources = [
    { resource_id: "R1", full_name: "Ann", profile: "ML Engineer" },
    { resource_id: "R2", full_name: "Bo", profile: "ML Engineer" },
  ] as Resource[];
  const expected: ExpectedTeam[] = [
    { id: 1, project_id: "P001", profile: "ML Engineer", quantity: 2, allocation_pct: 100, needed_from: "2026-07-01", needed_to: "2026-12-31" },
    { id: 2, project_id: "P001", profile: "AI Architect", quantity: 1, allocation_pct: 50, needed_from: "2026-07-01", needed_to: "2026-12-31" },
  ];
  const assignments: Assignment[] = [
    { id: 1, project_id: "P001", opportunity_id: "", resource_id: "R1", role_on_project: "ML", allocation_pct: 60, assigned_from: "2026-07-01", assigned_to: "2026-12-31" },
    { id: 2, project_id: "P001", opportunity_id: "", resource_id: "R2", role_on_project: "ML", allocation_pct: 50, assigned_from: "2026-07-01", assigned_to: "2026-08-31" },
  ];

  it("compares expected and assigned FTE by profile on the given date", () => {
    const rows = teamCoverage(project(), expected, assignments, resources, "2026-10-14");
    expect(rows).toEqual([
      { profile: "ML Engineer", expectedFte: 2, assignedFte: 0.6, gapFte: 1.4, people: ["Ann (60%)"] },
      { profile: "AI Architect", expectedFte: 0.5, assignedFte: 0, gapFte: 0.5, people: [] },
    ]);
  });

  it("uses the start date for a project that hasn't started", () => {
    const rows = teamCoverage(project(), expected, assignments, resources, "2026-01-01");
    expect(rows[0].assignedFte).toBe(1.1);
  });
});

describe("portfolio filters", () => {
  it("defaults to active projects and searches name and client", () => {
    const all = [project(), project({ project_id: "P002", status: "Completed" }), project({ project_id: "P003", is_draft: 1, status: "Draft" })];
    expect(filterProjects(all, { status: "active" }).map((p) => p.project_id)).toEqual(["P001"]);
    expect(filterProjects(all, { status: "Draft" }).map((p) => p.project_id)).toEqual(["P003"]);
    expect(filterProjects(all, { q: "acme" })).toHaveLength(3);
  });
});
