// Loads the input tabs (one CSV per tab, as exported from the Google Sheet) and validates them
// against input-files-schema.md v2. Each tab gets its own error list; nothing is silently dropped.
import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";
import { z } from "zod";
import { ALL_STAGES, CURRENCIES, EMPLOYMENT_TYPES, OPEN_STAGES, PROJECT_STATUSES, RESOURCE_STATUSES, ROLES } from "./domain";

/** True for a real calendar date written as YYYY-MM-DD (rejects 2026-09-31, which Date.parse would roll over). */
export function isRealDate(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

const date = z.string().refine(isRealDate, (v) => ({ message: v ? `"${v}" is not a real date (use YYYY-MM-DD)` : "is required" }));
export const optDate = z.union([z.literal(""), date]);
const text = z.string().trim().min(1, "is required");
const opt = z.string().trim().default("");
const email = z.string().trim().toLowerCase().email("must be an email");
/** "1,250,000" -> "1250000"; anything else (e.g. "1,304,02") is left as typed and fails as not a number. */
const thousands = (v: string) => (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(v) ? v.replace(/,/g, "") : v);
const num = z
  .string()
  .trim()
  .min(1, "is required")
  .transform(thousands)
  .pipe(z.coerce.number({ invalid_type_error: "must be a number" }).nonnegative());
const optNum = z.string().trim().transform((v, ctx) => {
  if (v === "") return null;
  const n = Number(thousands(v));
  if (Number.isNaN(n)) ctx.addIssue({ code: "custom", message: "must be a number" });
  return n;
});
const pct = num.pipe(z.number().max(100, "must be 0-100"));
/** An enum that ignores case, so "On Hold" is read as "On hold". */
const ienum = <const T extends string>(values: readonly [T, ...T[]]) =>
  z
    .string()
    .trim()
    .transform((v) => values.find((x) => x.toLowerCase() === v.toLowerCase()) ?? v)
    .pipe(z.enum(values));
/** Set by the importer on opportunities and projects loaded with missing or invalid fields; cleared when the row is saved in the app. */
const dataIssues = z.string().default("");

export const schemas = {
  users: z.object({ email, name: text, role: ienum(ROLES) }),
  profiles: z.object({ profile: text, description: opt }),
  settings: z.object({ key: text, value: text }),
  resources: z.object({
    resource_id: text,
    full_name: text,
    email,
    employment_type: ienum(EMPLOYMENT_TYPES),
    profile: text,
    seniority: opt,
    skills: opt,
    line_manager: opt,
    join_date: optDate,
    status: ienum(RESOURCE_STATUSES),
  }),
  opportunities: z.object({
    opportunity_id: text,
    opportunity_name: text,
    client_name: text,
    stage: ienum(ALL_STAGES),
    currency: z.union([z.literal(""), ienum(CURRENCIES)]).transform((v) => v || "USD"),
    opportunity_value: num,
    partner: text,
    bd_manager: text,
    initiation_date: date,
    stage_entered_date: date,
    expected_close_date: date,
    presales_resource_ids: opt,
    notes: opt,
    data_issues: dataIssues,
  }),
  // Projects are loaded in Phase 1 only so Closed-Won handoffs link to real project IDs.
  projects: z.object({
    project_id: text,
    project_name: text,
    project_type: ienum(["Client", "POC", "Accelerator"]),
    client_name: text,
    project_lead_email: email,
    start_date: date,
    planned_end_date: date,
    forecast_end_date: optDate,
    status: ienum(PROJECT_STATUSES),
    progress_pct: pct,
    currency: z.union([z.literal(""), ienum(CURRENCIES)]).transform((v) => v || "USD"),
    project_value: optNum,
    project_cost: optNum,
    actual_cost_to_date: optNum,
    margin_pct: optNum,
    plan_link: opt,
    charter_link: opt,
    contract_link: opt,
    stakeholder_map_link: opt,
    source_opportunity_id: opt,
    data_issues: dataIssues,
  }),
  project_status_updates: z
    .object({
      project_id: text,
      week_start: date,
      status: ienum(PROJECT_STATUSES),
      progress_pct: pct,
      summary: text,
      key_risks_issues: opt,
      next_steps: opt,
      updated_by: email,
    })
    .refine((u) => !(u.status === "At risk" || u.status === "Off track") || u.key_risks_issues, {
      message: "is required when status is At risk or Off track",
      path: ["key_risks_issues"],
    }),
  project_milestones: z.object({ project_id: text, milestone: text, planned_date: date, actual_date: optDate }),
  project_expected_team: z
    .object({ project_id: text, profile: text, quantity: num, allocation_pct: pct, needed_from: date, needed_to: date })
    .refine((t) => t.needed_to >= t.needed_from, { message: "can't be before needed_from", path: ["needed_to"] }),
  // Each row points at exactly one of a project (Project or Investment time) or an opportunity (Presales time).
  project_assignments: z
    .object({
      project_id: opt,
      opportunity_id: opt,
      resource_id: text,
      role_on_project: text,
      allocation_pct: pct,
      assigned_from: date,
      assigned_to: date,
    })
    .refine((a) => !!a.project_id !== !!a.opportunity_id, { message: "fill in exactly one of project_id or opportunity_id", path: ["project_id"] })
    .refine((a) => a.assigned_to >= a.assigned_from, { message: "can't be before assigned_from", path: ["assigned_to"] }),
  // One overall % per person per period: the engagement split comes from planned allocations.
  utilization: z.object({
    email,
    period_type: ienum(["Week", "Month"]),
    period_start: date,
    utilization_pct: pct,
  }),
} as const;

export type TabName = keyof typeof schemas;
export type TabRows = { [K in TabName]: z.output<(typeof schemas)[K]>[] };
/** errors: rows skipped or links that don't resolve. warnings: rows loaded but flagged as missing information. */
export type ImportResult = { data: TabRows; errors: Record<TabName, string[]>; warnings: Record<TabName, string[]> };

/** Tabs validated by the importer, in dependency order. */
export const TABS = Object.keys(schemas) as TabName[];
/** Tabs that may be missing from an input folder without an error. */
const OPTIONAL_TABS: TabName[] = [
  "projects",
  "profiles",
  "project_status_updates",
  "project_milestones",
  "project_expected_team",
  "project_assignments",
  "utilization",
];
const KEY_COLUMNS: Partial<Record<TabName, string[]>> = {
  users: ["email"],
  profiles: ["profile"],
  settings: ["key"],
  resources: ["resource_id"],
  opportunities: ["opportunity_id"],
  projects: ["project_id"],
  utilization: ["email", "period_type", "period_start"],
  project_status_updates: ["project_id", "week_start"],
};

export function parseCsv(content: string): Record<string, string>[] {
  const rows: Record<string, string>[] = parse(content, { columns: true, skip_empty_lines: true, trim: true, bom: true });
  return dropBlankRows(rows);
}

/** Spreadsheet exports often carry rows of empty cells (",,,,") below the data; they are not records. */
export const dropBlankRows = (rows: Record<string, string>[]) => rows.filter((r) => Object.values(r).some((v) => v !== ""));

/** Validates already-parsed tabs, e.g. from an .xlsx workbook. Missing optional tabs are fine; others are errors. */
export function validateTabs(raw: RawTabs, source: string): ImportResult {
  const result = validateAll(raw);
  for (const tab of TABS) if (!raw[tab] && !OPTIONAL_TABS.includes(tab)) result.errors[tab].push(`tab "${tab}" not found in ${source}`);
  return result;
}

/** Plain-language messages for enum values, so a typo shows what was typed and what is allowed. */
const errorMap: z.ZodErrorMap = (issue, ctx) => {
  if (issue.code === "invalid_enum_value") {
    return { message: issue.received === "" ? "is required" : `"${issue.received}" is not one of: ${issue.options.join(", ")}` };
  }
  return { message: ctx.defaultError };
};

function shapeOf(schema: z.ZodTypeAny): Record<string, z.ZodTypeAny> {
  let s = schema;
  while (s instanceof z.ZodEffects) s = s.innerType();
  return (s as z.AnyZodObject).shape;
}

/** Columns the sheet must have. data_issues is the tracker's own, never in the sheet. */
const columnsOf = (schema: z.ZodTypeAny) => Object.keys(shapeOf(schema)).filter((c) => c !== "data_issues");

/**
 * Opportunities and projects are shown even when incomplete (alpha: visibility first). A row that fails
 * validation still loads if it has an ID: each bad field gets a neutral value and the problems are
 * listed in data_issues, which the app shows as "Missing info".
 */
const LENIENT: Partial<Record<TabName, { id: string; name: string; fallback: Record<string, unknown> }>> = {
  opportunities: {
    id: "opportunity_id",
    name: "opportunity_name",
    fallback: { stage: OPEN_STAGES[0], opportunity_value: 0, initiation_date: "", stage_entered_date: "", expected_close_date: "" },
  },
  projects: {
    id: "project_id",
    name: "project_name",
    fallback: { project_type: "Client", status: "On track", progress_pct: 0, start_date: "", planned_end_date: "" },
  },
};

function lenientRow(tab: TabName, raw: Record<string, string>): { row: Record<string, unknown>; issues: string[] } | null {
  const spec = LENIENT[tab];
  const id = raw[spec?.id ?? ""]?.trim();
  if (!spec || !id) return null;
  const row: Record<string, unknown> = {};
  const issues: string[] = [];
  for (const [field, schema] of Object.entries(shapeOf(schemas[tab]))) {
    if (field === "data_issues") continue;
    const value = raw[field] ?? "";
    const res = schema.safeParse(value, { errorMap });
    if (res.success) {
      row[field] = res.data;
      continue;
    }
    const msg = res.error.issues[0]?.message ?? "is not valid";
    const typed = value.trim() && !msg.includes(`"${value.trim()}"`) ? ` (was "${value.trim()}")` : "";
    issues.push(`${field} ${msg}${typed}`);
    if (field in spec.fallback) row[field] = spec.fallback[field];
    else if (field === spec.name) row[field] = id;
    else {
      const blank = schema.safeParse("");
      row[field] = blank.success ? blank.data : value.trim();
    }
  }
  row.data_issues = issues.join("; ");
  return { row, issues };
}

export function validateTab<K extends TabName>(tab: K, rows: Record<string, string>[], errors: string[], warnings: string[] = []): TabRows[K] {
  const out: TabRows[K] = [];
  const seen = new Set<string>();
  const expected = columnsOf(schemas[tab]);
  const missing = rows.length ? expected.filter((c) => !(c in rows[0])) : [];
  for (const c of missing) errors.push(`missing column "${c}"`);
  if (missing.length) return out;
  rows.forEach((raw, i) => {
    const line = i + 2; // header is line 1
    let res = schemas[tab].safeParse(raw, { errorMap }) as z.SafeParseReturnType<unknown, unknown>;
    if (!res.success) {
      const lenient = lenientRow(tab, raw);
      if (lenient) {
        res = { success: true, data: lenient.row };
        warnings.push(`row ${line} (${raw[LENIENT[tab]!.id].trim()}): loaded with missing info: ${lenient.issues.join("; ")}`);
      }
    }
    if (!res.success) {
      const filled = Object.entries(raw).filter(([k, v]) => v !== "" && expected.includes(k)).map(([k]) => k);
      if (filled.length < 3) {
        errors.push(`row ${line}: unfinished, only ${filled.join(", ") || "nothing"} filled in`);
        return;
      }
      for (const issue of res.error.issues) errors.push(`row ${line}: ${issue.path.join(".")} ${issue.message}`);
      return;
    }
    const keyCols = KEY_COLUMNS[tab];
    if (keyCols) {
      const row = res.data as Record<string, unknown>;
      const id = keyCols.map((c) => String(row[c]).toLowerCase()).join("|");
      if (seen.has(id)) {
        errors.push(`row ${line}: duplicate ${keyCols.join(" + ")} "${keyCols.map((c) => row[c]).join(", ")}"`);
        return;
      }
      seen.add(id);
    }
    (out as unknown[]).push(res.data);
  });
  return out;
}

/** Cross-tab checks: profiles, presales resource IDs and opportunity links must point at real rows. */
function crossCheck(data: TabRows, errors: Record<TabName, string[]>) {
  const profiles = new Set(data.profiles.map((p) => p.profile));
  const resourceIds = new Set(data.resources.map((r) => r.resource_id));
  const oppIds = new Set(data.opportunities.map((o) => o.opportunity_id));
  const projectIds = new Set(data.projects.map((p) => p.project_id));
  if (profiles.size) {
    data.resources.forEach((r) => {
      if (!profiles.has(r.profile)) errors.resources.push(`${r.resource_id}: profile "${r.profile}" is not in the profiles tab`);
    });
  }
  data.opportunities.forEach((o) => {
    for (const id of splitIds(o.presales_resource_ids)) {
      if (!resourceIds.has(id)) errors.opportunities.push(`${o.opportunity_id}: presales resource "${id}" is not in the resources tab`);
    }
  });
  data.projects.forEach((p) => {
    if (p.source_opportunity_id && !oppIds.has(p.source_opportunity_id))
      errors.projects.push(`${p.project_id}: source opportunity "${p.source_opportunity_id}" is not in the opportunities tab`);
  });
  const unknownProject = (tab: "project_status_updates" | "project_milestones" | "project_expected_team") =>
    data[tab].forEach((r) => {
      if (!projectIds.has(r.project_id)) errors[tab].push(`project "${r.project_id}" is not in the projects tab`);
    });
  unknownProject("project_status_updates");
  unknownProject("project_milestones");
  unknownProject("project_expected_team");
  if (profiles.size) {
    data.project_expected_team.forEach((t) => {
      if (!profiles.has(t.profile)) errors.project_expected_team.push(`${t.project_id}: profile "${t.profile}" is not in the profiles tab`);
    });
  }
  data.project_assignments.forEach((a) => {
    const where = `${a.resource_id} on ${a.project_id || a.opportunity_id}`;
    if (!resourceIds.has(a.resource_id)) errors.project_assignments.push(`${where}: resource "${a.resource_id}" is not in the resources tab`);
    if (a.project_id && !projectIds.has(a.project_id)) errors.project_assignments.push(`${where}: project "${a.project_id}" is not in the projects tab`);
    if (a.opportunity_id && !oppIds.has(a.opportunity_id))
      errors.project_assignments.push(`${where}: opportunity "${a.opportunity_id}" is not in the opportunities tab`);
  });
  checkUtilization(data, errors.utilization);
}

/** Unknown emails are reported, not dropped; a person can't have both Week and Month rows for the same month. */
function checkUtilization(data: TabRows, errors: string[]) {
  const emails = new Set(data.resources.map((r) => r.email));
  const unknown = new Set(data.utilization.map((u) => u.email).filter((e) => !emails.has(e)));
  for (const e of unknown) errors.push(`${e}: not in the resources tab`);
  const months = new Set(data.utilization.filter((u) => u.period_type === "Month").map((u) => `${u.email}|${u.period_start.slice(0, 7)}`));
  const clashes = new Set(
    data.utilization
      .filter((u) => u.period_type === "Week" && months.has(`${u.email}|${u.period_start.slice(0, 7)}`))
      .map((u) => `${u.email} has both Week and Month rows for ${u.period_start.slice(0, 7)}; send one or the other`),
  );
  errors.push(...clashes);
}

export const splitIds = (s: string) => s.split(/[;,]/).map((x) => x.trim()).filter(Boolean);

export function validateAll(raw: Partial<Record<TabName, Record<string, string>[]>>): ImportResult {
  const errors = Object.fromEntries(TABS.map((t) => [t, [] as string[]])) as Record<TabName, string[]>;
  const warnings = Object.fromEntries(TABS.map((t) => [t, [] as string[]])) as Record<TabName, string[]>;
  const data = Object.fromEntries(TABS.map((t) => [t, validateTab(t, raw[t] ?? [], errors[t], warnings[t])])) as TabRows;
  crossCheck(data, errors);
  return { data, errors, warnings };
}

export type RawTabs = Partial<Record<TabName, Record<string, string>[]>>;

/** Reads one CSV per tab from a folder; tabs without a file are left out. */
export function readCsvDir(dir: string): RawTabs {
  const raw: RawTabs = {};
  for (const tab of TABS) {
    const file = path.join(dir, `${tab}.csv`);
    if (fs.existsSync(file)) raw[tab] = parseCsv(fs.readFileSync(file, "utf8"));
  }
  return raw;
}

export const loadCsvDir = (dir: string): ImportResult => validateTabs(readCsvDir(dir), dir);

export const errorCount = (errors: Record<string, string[]>) => Object.values(errors).reduce((n, e) => n + e.length, 0);
