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
    const { data, errors, warnings } = validateAll({ opportunities: opps });
    // Incomplete opportunities still load, flagged; only the duplicate is dropped.
    expect(data.opportunities.map((o) => o.opportunity_id)).toEqual(["O1", "O2", "O3"]);
    const warned = warnings.opportunities.join("\n");
    expect(warned).toMatch(/row 2 \(O1\): loaded with missing info: stage/);
    expect(warned).toMatch(/row 3 \(O2\): .*currency/);
    expect(warned).toMatch(/row 3 \(O2\): .*initiation_date/);
    const text = errors.opportunities.join("\n");
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

describe("incomplete opportunities and projects", () => {
  const projHeader =
    "project_id,project_name,project_type,client_name,project_lead_email,start_date,planned_end_date,forecast_end_date,status,progress_pct,currency,project_value,project_cost,actual_cost_to_date,margin_pct,plan_link,charter_link,contract_link,stakeholder_map_link,source_opportunity_id";

  it("loads a project with gaps, using neutral values and listing what is missing", () => {
    const { data, errors, warnings } = validateAll({
      projects: parseCsv([projHeader, "P6,Water,Client,NWC,lead@firm,2026-01-01,,,On Hold,,SAR,\"1,250,000\",,,,,,,,", ",,,,,,,,,,,,,,,,,,,"].join("\n")),
    });
    expect(errors.projects).toEqual([]);
    const p = data.projects[0];
    expect(p).toMatchObject({ project_id: "P6", status: "On hold", planned_end_date: "", progress_pct: 0, project_value: 1250000, project_lead_email: "lead@firm" });
    expect(p.data_issues).toMatch(/project_lead_email must be an email \(was "lead@firm"\)/);
    expect(p.data_issues).toMatch(/planned_end_date is required/);
    expect(p.data_issues).toMatch(/progress_pct is required/);
    expect(warnings.projects).toHaveLength(1);
  });

  it("still skips a row with no ID, and complete rows carry no flag", () => {
    const { data, errors } = validateAll({
      projects: parseCsv([projHeader, ",Nameless,Client,X,a@b.com,2026-01-01,2026-02-01,,On track,10,USD,,,,,,,,,", "P1,Ok,Client,X,a@b.com,2026-01-01,2026-02-01,,On track,10,USD,,,,,,,,,"].join("\n")),
    });
    expect(data.projects.map((p) => [p.project_id, p.data_issues])).toEqual([["P1", ""]]);
    expect(errors.projects[0]).toMatch(/row 2/);
  });

  it("keeps a value it can't read as 0 and shows what was typed", () => {
    const { data } = validateAll({
      opportunities: parseCsv(
        [
          "opportunity_id,opportunity_name,client_name,stage,currency,opportunity_value,partner,bd_manager,initiation_date,stage_entered_date,expected_close_date,presales_resource_ids,notes",
          'O16,Deal,C,lost,USD,"1,304,02",P,B,2026-01-01,2026-01-01,2026-02-01,,',
        ].join("\n"),
      ),
    });
    expect(data.opportunities[0]).toMatchObject({ stage: "Lost", opportunity_value: 0 });
    expect(data.opportunities[0].data_issues).toBe('opportunity_value must be a number (was "1,304,02")');
  });
});
