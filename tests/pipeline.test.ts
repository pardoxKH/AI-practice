import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, type Opportunity } from "@/lib/domain";
import { byStage, convert, filterOpps, growthHealth, needsAttention, pipelineKpis, quarterBounds, stageAgeDays, weekStart } from "@/lib/pipeline";

const today = "2026-10-11";
const s = DEFAULT_SETTINGS;
const opp = (o: Partial<Opportunity>): Opportunity => ({
  opportunity_id: "O001",
  opportunity_name: "Test",
  client_name: "Client",
  stage: "Lead Identification & Qualification",
  currency: "USD",
  opportunity_value: 100_000,
  partner: "P",
  bd_manager: "B",
  initiation_date: "2026-09-01",
  stage_entered_date: "2026-10-01",
  expected_close_date: "2026-12-31",
  presales_resource_ids: "",
  notes: "",
  ...o,
});

describe("currency", () => {
  it("converts both ways at the admin rate", () => {
    expect(convert(100, "USD", "SAR", 3.75)).toBe(375);
    expect(convert(375, "SAR", "USD", 3.75)).toBe(100);
    expect(convert(5, "USD", "USD", 3.75)).toBe(5);
  });
});

describe("dates", () => {
  it("computes stage aging in days", () => {
    expect(stageAgeDays(opp({ stage_entered_date: "2026-09-20" }), today)).toBe(21);
  });
  it("finds the quarter and the Monday of the week", () => {
    expect(quarterBounds(today)).toEqual({ start: "2026-10-01", end: "2026-12-31", label: "Q4 2026" });
    expect(quarterBounds("2026-02-15").end).toBe("2026-03-31");
    expect(weekStart("2026-10-11")).toBe("2026-10-05"); // Sunday
    expect(weekStart("2026-10-05")).toBe("2026-10-05"); // Monday
  });
});

describe("KPIs", () => {
  const opps = [
    opp({ opportunity_id: "A", opportunity_value: 100_000 }),
    opp({ opportunity_id: "B", currency: "SAR", opportunity_value: 375_000, expected_close_date: "2027-03-01" }),
    opp({ opportunity_id: "C", stage: "Closed-Won & Delivery Handoff", stage_entered_date: "2026-06-01", opportunity_value: 50_000 }),
    opp({ opportunity_id: "D", stage: "Lost", stage_entered_date: "2026-05-01" }),
    opp({ opportunity_id: "E", stage: "On hold" }),
    opp({ opportunity_id: "F", expected_close_date: "2026-10-01", opportunity_value: 20_000 }),
  ];
  const k = pipelineKpis(opps, "USD", s, today);

  it("counts only stages 1-5 as open pipeline, converting SAR", () => {
    expect(k.openCount).toBe(3);
    expect(k.openValue).toBe(220_000);
  });
  it("finds closes this quarter, won this year, overdue and outcomes", () => {
    expect(k.closingThisQuarterCount).toBe(2);
    expect(k.closingThisQuarterValue).toBe(120_000);
    expect(k.wonYtdValue).toBe(50_000);
    expect(k.overdueCount).toBe(1);
    expect(k.onHoldCount).toBe(1);
    expect(k.lostYtdCount).toBe(1);
  });
  it("reports in SAR when toggled", () => {
    expect(pipelineKpis(opps, "SAR", s, today).openValue).toBe(825_000);
  });
  it("groups every stage, including Lost and On hold", () => {
    const rows = byStage(opps, "USD", s, today);
    expect(rows).toHaveLength(8);
    expect(rows.find((r) => r.stage === "Lead Identification & Qualification")?.count).toBe(3);
  });
});

describe("needs attention and growth health", () => {
  it("lists overdue before aging and ignores closed deals", () => {
    const items = needsAttention(
      [
        opp({ opportunity_id: "aging", stage_entered_date: "2026-07-01" }),
        opp({ opportunity_id: "late", expected_close_date: "2026-09-30" }),
        opp({ opportunity_id: "won", stage: "Closed-Won & Delivery Handoff", expected_close_date: "2026-01-01" }),
        opp({ opportunity_id: "fine" }),
      ],
      s,
      today,
    );
    expect(items.map((i) => [i.opportunity.opportunity_id, i.kind])).toEqual([
      ["late", "Overdue"],
      ["aging", "Aging"],
    ]);
  });
  it("rates growth by the share of open value at risk", () => {
    expect(growthHealth([opp({})], s, today).rag).toBe("Green");
    expect(growthHealth([opp({ opportunity_value: 80 }), opp({ opportunity_value: 20, expected_close_date: "2026-01-01" })], s, today).rag).toBe("Amber");
    expect(growthHealth([opp({ expected_close_date: "2026-01-01" })], s, today).rag).toBe("Red");
    expect(growthHealth([], s, today).rag).toBe("Red");
  });
});

describe("filters", () => {
  it("filters by open stages, partner and free text", () => {
    const opps = [opp({ opportunity_id: "1", partner: "X", notes: "workshop" }), opp({ opportunity_id: "2", stage: "Lost" })];
    expect(filterOpps(opps, { stage: "open" }).map((o) => o.opportunity_id)).toEqual(["1"]);
    expect(filterOpps(opps, { partner: "X" })).toHaveLength(1);
    expect(filterOpps(opps, { q: "WORKSHOP" })).toHaveLength(1);
  });
});
