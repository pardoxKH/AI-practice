import path from "node:path";
import { describe, expect, it } from "vitest";
import { errorCount, loadCsvDir, parseCsv, validateAll } from "@/lib/importer";

describe("importer", () => {
  it("accepts the dummy sample data with no errors", () => {
    const { data, errors } = loadCsvDir(path.join(__dirname, "..", "data", "sample"));
    expect(errorCount(errors)).toBe(0);
    expect(data.resources).toHaveLength(18);
    expect(data.users).toHaveLength(13);
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
