import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { type DB, openDb, seedFromDir } from "@/lib/db";
import { access, canEdit } from "@/lib/permissions";
import {
  createOpportunity,
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
