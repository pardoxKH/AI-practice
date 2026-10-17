import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { type DB, openDb, seedFromDir } from "@/lib/db";
import { access, canEdit, canEditProject, canSeeFinancials } from "@/lib/permissions";
import {
  addAssignment,
  createOpportunity,
  deleteAssignment,
  getProject,
  importUtilization,
  listAssignments,
  listExpectedTeam,
  listStatusUpdates,
  listUtilization,
  saveProject,
  saveStatusUpdate,
  getOpportunity,
  getSettings,
  listAudit,
  listOpportunities,
  projectForOpportunity,
  saveSettings,
  snapshotPipelineIfDue,
  updateOpportunity,
} from "@/lib/store";

const SAMPLE = path.join(__dirname, "..", "data", "sample");
let db: DB;
beforeEach(() => {
  db = openDb(":memory:");
  seedFromDir(db, SAMPLE);
});

const actor = "tariq.k@firm.com";

describe("seeding the dummy data", () => {
  it("loads every opportunity and the settings", () => {
    expect(listOpportunities(db)).toHaveLength(13);
    expect(getSettings(db).usd_to_sar_rate).toBe(3.75);
  });
});

describe("opportunity edits", () => {
  it("resets stage_entered_date on a stage change and audits each field", () => {
    const before = getOpportunity(db, "O003")!;
    updateOpportunity(db, actor, "O003", { ...before, stage: "Proposal Submission & Pitch Defense", notes: "Submitted" }, "2026-10-20");
    const after = getOpportunity(db, "O003")!;
    expect(after.stage_entered_date).toBe("2026-10-20");
    const fields = listAudit(db, { entity: "opportunities", entityId: "O003" }).map((a) => a.field).sort();
    expect(fields).toEqual(["notes", "stage", "stage_entered_date"]);
  });

  it("keeps an explicitly edited stage_entered_date", () => {
    const before = getOpportunity(db, "O003")!;
    updateOpportunity(db, actor, "O003", { ...before, stage: "Proposal Submission & Pitch Defense", stage_entered_date: "2026-10-15" }, "2026-10-20");
    expect(getOpportunity(db, "O003")!.stage_entered_date).toBe("2026-10-15");
  });

  it("creates one linked draft project when a deal is won", () => {
    const before = getOpportunity(db, "O003")!;
    const res = updateOpportunity(db, actor, "O003", { ...before, stage: "Closed-Won & Delivery Handoff" }, "2026-10-20");
    expect(res.draftProjectId).toBe("P009");
    expect(projectForOpportunity(db, "O003")).toMatchObject({ project_id: "P009", is_draft: 1 });
    // Moving away and back does not create a second project.
    const won = getOpportunity(db, "O003")!;
    updateOpportunity(db, actor, "O003", { ...won, stage: "On hold" }, "2026-10-21");
    const again = updateOpportunity(db, actor, "O003", { ...won, stage: "Closed-Won & Delivery Handoff" }, "2026-10-22");
    expect(again.draftProjectId).toBeUndefined();
  });

  it("does not create a project for deals already linked to one", () => {
    const won = getOpportunity(db, "O009")!;
    updateOpportunity(db, actor, "O009", { ...won, stage: "On hold" }, "2026-10-20");
    expect(updateOpportunity(db, actor, "O009", { ...won }, "2026-10-21").draftProjectId).toBeUndefined();
  });

  it("assigns the next ID to new opportunities", () => {
    const { id } = createOpportunity(
      db,
      actor,
      {
        opportunity_name: "New",
        client_name: "C",
        stage: "Lead Identification & Qualification",
        currency: "USD",
        opportunity_value: 1,
        partner: "P",
        bd_manager: "B",
        initiation_date: "2026-10-11",
        expected_close_date: "2026-12-01",
        presales_resource_ids: "",
        notes: "",
      },
      "2026-10-11",
    );
    expect(id).toBe("O014");
    expect(getOpportunity(db, id)!.stage_entered_date).toBe("2026-10-11");
  });
});

describe("settings and snapshots", () => {
  it("audits only the settings that changed", () => {
    saveSettings(db, actor, { usd_to_sar_rate: 3.76, utilization_target_pct: 80 });
    expect(getSettings(db).usd_to_sar_rate).toBe(3.76);
    expect(listAudit(db, { entity: "settings" }).filter((a) => a.action === "update").map((a) => a.entity_id)).toEqual(["usd_to_sar_rate"]);
  });

  it("snapshots the pipeline once per week", () => {
    expect(snapshotPipelineIfDue(db, "2026-10-11")).toBe(true);
    expect(snapshotPipelineIfDue(db, "2026-10-09")).toBe(false);
    expect(snapshotPipelineIfDue(db, "2026-10-12")).toBe(true);
  });
});

describe("permissions", () => {
  it("matches the signed-off matrix", () => {
    expect(canEdit("Admin", "opportunities")).toBe(true);
    expect(access("Leadership", "opportunities")).toBe("view");
    expect(access("Project lead", "opportunities")).toBe("view");
    expect(access("HR", "opportunities")).toBe("none");
    expect(canEdit("Leadership", "resources")).toBe(false);
    expect(access("HR", "users")).toBe("none");
  });
});

describe("data source badge", () => {
  it("knows when the dummy sample is loaded", async () => {
    const { isDummyData } = await import("@/lib/store");
    expect(isDummyData(db)).toBe(true);
    db.prepare("INSERT INTO audit_log (at, actor_email, entity, entity_id, action, new_value) VALUES ('x','seed','users','*','import','13 rows from data/local/tracker.xlsx')").run();
    expect(isDummyData(db)).toBe(false);
  });
});

describe("phase 2 data", () => {
  it("loads projects, updates, team, assignments and utilization from the sample", () => {
    expect(listStatusUpdates(db).length).toBeGreaterThan(0);
    expect(listExpectedTeam(db).length).toBeGreaterThan(0);
    expect(listAssignments(db)).toHaveLength(38);
    expect(listAssignments(db).some((a) => a.opportunity_id)).toBe(true);
    expect(listUtilization(db)).toHaveLength(96);
  });

  it("replaces the same week's update and carries status and progress onto the project", () => {
    const u = { project_id: "P001", week_start: "2026-10-12", status: "Off track" as const, progress_pct: 47, summary: "Slipping", key_risks_issues: "Data", next_steps: "", updated_by: actor };
    saveStatusUpdate(db, actor, u, "2027-02-28");
    saveStatusUpdate(db, actor, { ...u, progress_pct: 48 });
    const weeks = listStatusUpdates(db, "P001").filter((x) => x.week_start === "2026-10-12");
    expect(weeks).toHaveLength(1);
    expect(weeks[0].progress_pct).toBe(48);
    const p = getProject(db, "P001")!;
    expect([p.status, p.progress_pct, p.forecast_end_date]).toEqual(["Off track", 48, "2027-02-28"]);
    expect(listAudit(db, { entity: "projects", entityId: "P001" }).map((a) => a.field)).toContain("status");
  });

  it("completes a draft project when the admin saves it", () => {
    const o = getOpportunity(db, "O003")!;
    const { draftProjectId } = updateOpportunity(db, actor, "O003", { ...o, stage: "Closed-Won & Delivery Handoff" }, "2026-10-20");
    const draft = getProject(db, draftProjectId!)!;
    expect(draft.is_draft).toBe(1);
    saveProject(db, actor, { ...draft, project_lead_email: "omar.saleh@firm.com", start_date: "2026-11-01", planned_end_date: "2027-03-31", status: "On track" });
    expect(getProject(db, draftProjectId!)!.is_draft).toBe(0);
  });

  it("audits assignments added and removed", () => {
    const id = addAssignment(db, actor, { project_id: "P001", opportunity_id: "", resource_id: "R003", role_on_project: "QA", allocation_pct: 20, assigned_from: "2026-10-12", assigned_to: "2026-12-31" });
    deleteAssignment(db, actor, id);
    expect(listAudit(db, { entity: "project_assignments", entityId: String(id) }).map((a) => a.action).sort()).toEqual(["create", "delete"]);
  });

  it("re-importing a period replaces it and reports unknown emails", () => {
    const before = listUtilization(db);
    const week = before.find((r) => r.period_type === "Week")!.period_start;
    const inWeek = before.filter((r) => r.period_type === "Week" && r.period_start === week);
    const rows = [
      { email: inWeek[0].email.toUpperCase(), period_type: "Week" as const, period_start: week, utilization_pct: 11 },
      { email: "ghost@firm.com", period_type: "Week" as const, period_start: week, utilization_pct: 70 },
    ];
    const r = importUtilization(db, actor, rows, "ops.csv");
    expect(r.replaced).toBe(inWeek.length);
    expect(r.unknownEmails).toEqual(["ghost@firm.com"]);
    const after = listUtilization(db).filter((x) => x.period_type === "Week" && x.period_start === week);
    expect(after).toHaveLength(2);
    expect(listUtilization(db)).toHaveLength(before.length - inWeek.length + 2);
  });
});

describe("project permissions", () => {
  const p = { project_lead_email: "omar.saleh@firm.com" };
  it("lets a lead edit and see financials only for their own projects", () => {
    const omar = { email: "Omar.Saleh@firm.com", name: "Omar", role: "Project lead" as const };
    const lina = { email: "lina.haddad@firm.com", name: "Lina", role: "Project lead" as const };
    expect(canEditProject(omar, p)).toBe(true);
    expect(canEditProject(lina, p)).toBe(false);
    expect(canSeeFinancials(lina, p)).toBe(false);
    expect(canSeeFinancials({ email: "x@firm.com", name: "L", role: "Leadership" }, p)).toBe(true);
    expect(canEditProject({ email: "x@firm.com", name: "L", role: "Leadership" }, p)).toBe(false);
    expect(access("HR", "projects")).toBe("none");
    expect(access("HR", "utilization")).toBe("view");
  });
});

describe("missing info flags", () => {
  it("adds the data_issues column to a database made before it existed", async () => {
    const { default: Database } = await import("better-sqlite3");
    const os = await import("node:os");
    const fs = await import("node:fs");
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "tracker-")), "old.db");
    const old = new Database(file);
    old.exec("CREATE TABLE opportunities (opportunity_id TEXT PRIMARY KEY); CREATE TABLE projects (project_id TEXT PRIMARY KEY);");
    old.close();
    const db2 = openDb(file);
    const cols = (t: string) => (db2.prepare(`PRAGMA table_info(${t})`).all() as { name: string }[]).map((c) => c.name);
    expect(cols("opportunities")).toContain("data_issues");
    expect(cols("projects")).toContain("data_issues");
    db2.close();
  });

  it("clears the flag when the row is saved in the app", () => {
    db.prepare("UPDATE projects SET data_issues = 'planned_end_date is required' WHERE project_id = 'P001'").run();
    db.prepare("UPDATE opportunities SET data_issues = 'stage is required' WHERE opportunity_id = 'O003'").run();
    saveProject(db, actor, getProject(db, "P001")!);
    const o = getOpportunity(db, "O003")!;
    updateOpportunity(db, actor, "O003", o, "2026-10-20");
    expect(getProject(db, "P001")!.data_issues).toBe("");
    expect(getOpportunity(db, "O003")!.data_issues).toBe("");
  });
});
