import { describe, expect, it } from "vitest";
import { fillOpportunityDates, PLACEHOLDER_NOTE } from "@/lib/placeholders";

const row = (id: string, stage: string, extra: Record<string, string> = {}) => ({
  opportunity_id: id,
  stage,
  initiation_date: "",
  stage_entered_date: "",
  expected_close_date: "",
  notes: "",
  ...extra,
});

describe("placeholder opportunity dates", () => {
  const today = "2026-10-14";
  const input = [
    ...Array.from({ length: 30 }, (_, i) => row(`O${i}`, "Proposal Submission & Pitch Defense")),
    ...Array.from({ length: 30 }, (_, i) => row(`W${i}`, "Closed-Won & Delivery Handoff")),
  ];
  const { rows, filled } = fillOpportunityDates(input, 2026, today);

  it("fills every blank date inside the year, in a sensible order, and flags the row", () => {
    expect(filled).toBe(60);
    for (const r of rows) {
      expect(r.initiation_date >= "2026-01-01" && r.expected_close_date <= "2026-12-31").toBe(true);
      expect(r.initiation_date <= r.stage_entered_date).toBe(true);
      expect(r.stage_entered_date <= today).toBe(true);
      expect(r.stage_entered_date <= r.expected_close_date).toBe(true);
      expect(r.notes).toContain(PLACEHOLDER_NOTE);
    }
  });

  it("puts open deals' expected close after today", () => {
    expect(rows.filter((r) => r.opportunity_id.startsWith("O")).every((r) => r.expected_close_date > today)).toBe(true);
  });

  it("is repeatable and keeps dates that were filled in", () => {
    expect(fillOpportunityDates(input, 2026, today).rows).toEqual(rows);
    const kept = fillOpportunityDates([row("X", "Lost", { initiation_date: "2026-03-01", notes: "n" })], 2026, today).rows[0];
    expect(kept.initiation_date).toBe("2026-03-01");
    expect(kept.notes).toBe(`n ${PLACEHOLDER_NOTE}`);
    const complete = row("Y", "Lost", { initiation_date: "2026-03-01", stage_entered_date: "2026-04-01", expected_close_date: "2026-04-30" });
    expect(fillOpportunityDates([complete], 2026, today)).toEqual({ rows: [complete], filled: 0 });
  });
});

describe("missing info", () => {
  it("counts placeholder dates as missing info", async () => {
    const { issuesOf } = await import("@/lib/issues");
    expect(issuesOf({ data_issues: "", notes: `x ${PLACEHOLDER_NOTE}` })).toEqual(["dates are placeholders, not real dates"]);
    expect(issuesOf({ data_issues: "a is required; b is required" })).toEqual(["a is required", "b is required"]);
    expect(issuesOf({ data_issues: "" })).toEqual([]);
  });
});
