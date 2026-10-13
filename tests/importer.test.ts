import path from "node:path";
import { describe, expect, it } from "vitest";
import { errorCount, loadCsvDir, parseCsv, validateAll } from "@/lib/importer";

describe("importer", () => {
  it("accepts the dummy sample data with no errors", () => {
    const { data, errors } = loadCsvDir(path.join(__dirname, "..", "data", "sample"));
    expect(errorCount(errors)).toBe(0);
    expect(data.resources).toHaveLength(18);
    expect(data.users).toHaveLength(13);
    expect(data.utilization).toHaveLength(96);
  });

  it("reports bad enums, dates, duplicates and broken links per tab", () => {
    const opps = parseCsv(
      [
        "opportunity_id,opportunity_name,client_name,stage,currency,opportunity_value,partner,bd_manager,initiation_date,stage_entered_date,expected_close_date,presales_resource_ids,notes",
        "O1,A,C,Presales,USD,10,P,B,2026-01-01,2026-01-01,2026-02-01,,",
        "O2,A,C,Lost,EUR,10,P,B,2026-13-01,2026-01-01,2026-02-01,,",
        "O3,A,C,Lost,USD,10,P,B,2026-01-01,2026-01-01,2026-02-01,R999,",
        "O3,A,C,Lost,USD,10,P,B,2026-01-01,2026-01-01,2026-02-01,,",
      ].join("\n"),
    );
    const { data, errors } = validateAll({ opportunities: opps });
    expect(data.opportunities.map((o) => o.opportunity_id)).toEqual(["O3"]);
    const text = errors.opportunities.join("\n");
    expect(text).toMatch(/row 2: stage/);
    expect(text).toMatch(/row 3: currency/);
    expect(text).toMatch(/row 3: initiation_date/);
    expect(text).toMatch(/row 5: duplicate opportunity_id/);
    expect(text).toMatch(/presales resource "R999"/);
  });

  it("reports missing columns instead of guessing", () => {
    const { errors } = validateAll({ users: parseCsv("email,name\na@b.com,A") });
    expect(errors.users).toEqual(['missing column "role"']);
  });
});

describe("utilization tab", () => {
  const resources = parseCsv(
    "resource_id,full_name,email,employment_type,profile,seniority,skills,line_manager,join_date,status\nR001,A,a@firm.com,FTE,ML Engineer,,,,,Active",
  );
  const util = (rows: string[]) => parseCsv(["email,period_type,period_start,utilization_pct", ...rows].join("\n"));

  it("accepts one overall row per person per period", () => {
    const { data, errors } = validateAll({ resources, utilization: util(["a@firm.com,Week,2026-10-05,60", "A@firm.com,Week,2026-10-12,80"]) });
    expect(errors.utilization).toEqual([]);
    expect(data.utilization.map((u) => u.utilization_pct)).toEqual([60, 80]);
  });

  it("rejects per-engagement rows for the same period, bad values and unknown people", () => {
    const { errors } = validateAll({
      resources,
      utilization: util(["a@firm.com,Week,2026-10-05,60", "a@firm.com,Week,2026-10-05,20", "a@firm.com,Week,2026-10-12,120", "x@firm.com,Week,2026-10-05,50"]),
    });
    const text = errors.utilization.join("\n");
    expect(text).toMatch(/row 3: duplicate email \+ period_type \+ period_start/);
    expect(text).toMatch(/row 4: utilization_pct must be 0-100/);
    expect(text).toMatch(/x@firm.com: not in the resources tab/);
  });

  it("flags Week and Month rows for the same person and month", () => {
    const { errors } = validateAll({ resources, utilization: util(["a@firm.com,Month,2026-10-01,70", "a@firm.com,Week,2026-10-05,60"]) });
    expect(errors.utilization).toEqual(["a@firm.com has both Week and Month rows for 2026-10; send one or the other"]);
  });
});
