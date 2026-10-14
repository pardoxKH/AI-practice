import path from "node:path";
import { describe, expect, it } from "vitest";
import { errorCount, isRealDate, loadCsvDir, parseCsv, validateAll } from "@/lib/importer";

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

describe("project_assignments tab", () => {
  const sample = loadCsvDir(path.join(__dirname, "..", "data", "sample"));
  const header = "project_id,opportunity_id,resource_id,role_on_project,allocation_pct,assigned_from,assigned_to";
  const check = (rows: string[]) =>
    validateAll({
      resources: parseCsv("resource_id,full_name,email,employment_type,profile,seniority,skills,line_manager,join_date,status\nR001,A,a@firm.com,FTE,ML Engineer,,,,,Active"),
      projects: [],
      opportunities: [],
      project_assignments: parseCsv([header, ...rows].join("\n")),
    }).errors.project_assignments;

  it("links presales rows in the sample to opportunities", () => {
    const presales = sample.data.project_assignments.filter((a) => a.opportunity_id);
    expect(presales.length).toBeGreaterThan(0);
    expect(presales.every((a) => !a.project_id)).toBe(true);
  });

  it("needs exactly one of project_id or opportunity_id", () => {
    const errs = check([",,R001,Presales,10,2026-10-01,2026-10-31", "P001,O001,R001,Lead,10,2026-10-01,2026-10-31"]).join("\n");
    expect(errs).toMatch(/row 2: project_id fill in exactly one/);
    expect(errs).toMatch(/row 3: project_id fill in exactly one/);
  });

  it("reports links to unknown projects, opportunities and people", () => {
    const errs = check(["P999,,R001,Lead,50,2026-10-01,2026-10-31", ",O999,R002,Presales,10,2026-10-01,2026-10-31"]).join("\n");
    expect(errs).toMatch(/project "P999" is not in the projects tab/);
    expect(errs).toMatch(/opportunity "O999" is not in the opportunities tab/);
    expect(errs).toMatch(/resource "R002" is not in the resources tab/);
  });
});

describe("work-in-progress files", () => {
  it("rejects impossible dates that Date.parse would roll over", () => {
    expect(isRealDate("2026-09-30")).toBe(true);
    expect(isRealDate("2026-09-31")).toBe(false);
    expect(isRealDate("2026-02-29")).toBe(false);
    expect(isRealDate("2028-02-29")).toBe(true);
    expect(isRealDate("30/09/2026")).toBe(false);
  });

  it("drops blank rows, names unfinished rows once, and spells out enum typos", () => {
    const header = "email,name,role";
    const { data, errors } = validateAll({ users: parseCsv([header, "a@b.com,A,Admin", ",,", "c@b.com,,", "d@b.com,D,Leader"].join("\n")) });
    expect(data.users).toHaveLength(1);
    expect(errors.users).toEqual([
      "row 3: unfinished, only email filled in",
      'row 4: role "Leader" is not one of: Admin, Project lead, HR, Leadership',
    ]);
  });
});
