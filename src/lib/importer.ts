// Loads the input tabs (one CSV per tab, as exported from the Google Sheet) and validates them
// against input-files-schema.md v2. Each tab gets its own error list; nothing is silently dropped.
import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";
import { z } from "zod";
import { ALL_STAGES, CURRENCIES, EMPLOYMENT_TYPES, RESOURCE_STATUSES, ROLES } from "./domain";

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
const num = z.string().trim().min(1, "is required").pipe(z.coerce.number({ invalid_type_error: "must be a number" }).nonnegative());
const optNum = z.string().trim().transform((v, ctx) => {
  if (v === "") return null;
  const n = Number(v);
  if (Number.isNaN(n)) ctx.addIssue({ code: "custom", message: "must be a number" });
  return n;
});
const pct = num.pipe(z.number().max(100, "must be 0-100"));

export const schemas = {
  users: z.object({ email, name: text, role: z.enum(ROLES) }),
  profiles: z.object({ profile: text, description: opt }),
  settings: z.object({ key: text, value: text }),
  resources: z.object({
    resource_id: text,
    full_name: text,
    email,
    employment_type: z.enum(EMPLOYMENT_TYPES),
    profile: text,
    seniority: opt,
    skills: opt,
    line_manager: opt,
    join_date: optDate,
    status: z.enum(RESOURCE_STATUSES),
  }),
  opportunities: z.object({
    opportunity_id: text,
    opportunity_name: text,
    client_name: text,
    stage: z.enum(ALL_STAGES),
    currency: z.union([z.literal(""), z.enum(CURRENCIES)]).transform((v) => v || "USD"),
    opportunity_value: num,
    partner: text,
    bd_manager: text,
    initiation_date: date,
    stage_entered_date: date,
    expected_close_date: date,
    presales_resource_ids: opt,
    notes: opt,
  }),
  // Projects are loaded in Phase 1 only so Closed-Won handoffs link to real project IDs.
  projects: z.object({
    project_id: text,
    project_name: text,
    project_type: z.enum(["Client", "POC", "Accelerator"]),
    client_name: text,
    project_lead_email: email,
    start_date: date,
    planned_end_date: date,
    forecast_end_date: optDate,
    status: z.enum(["On track", "At risk", "Off track", "Completed", "On hold"]),
    progress_pct: pct,
    currency: z.union([z.literal(""), z.enum(CURRENCIES)]).transform((v) => v || "USD"),
    project_value: optNum,
    project_cost: optNum,
    actual_cost_to_date: optNum,
    margin_pct: optNum,
    plan_link: opt,
    charter_link: opt,
    contract_link: opt,
    stakeholder_map_link: opt,
    source_opportunity_id: opt,
  }),
  // Validated now so the files can be checked early; loaded into the app in Phase 2.
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
    period_type: z.enum(["Week", "Month"]),
    period_start: date,
    utilization_pct: pct,
  }),
} as const;

export type TabName = keyof typeof schemas;
export type TabRows = { [K in TabName]: z.output<(typeof schemas)[K]>[] };
export type ImportResult = { data: TabRows; errors: Record<TabName, string[]> };

/** Tabs validated by the importer, in dependency order. */
export const TABS = Object.keys(schemas) as TabName[];
/** Tabs that may be missing from an input folder without an error. */
const OPTIONAL_TABS: TabName[] = ["projects", "profiles", "project_assignments", "utilization"];
const KEY_COLUMNS: Partial<Record<TabName, string[]>> = {
  users: ["email"],
  profiles: ["profile"],
  settings: ["key"],
  resources: ["resource_id"],
  opportunities: ["opportunity_id"],
  projects: ["project_id"],
  utilization: ["email", "period_type", "period_start"],
};

export function parseCsv(content: string): Record<string, string>[] {
  const rows: Record<string, string>[] = parse(content, { columns: true, skip_empty_lines: true, trim: true, bom: true });
  return dropBlankRows(rows);
}

/** Spreadsheet exports often carry rows of empty cells (",,,,") below the data; they are not records. */
export const dropBlankRows = (rows: Record<string, string>[]) => rows.filter((r) => Object.values(r).some((v) => v !== ""));

/** Validates already-parsed tabs, e.g. from an .xlsx workbook. Missing optional tabs are fine; others are errors. */
export function validateTabs(raw: Partial<Record<TabName, Record<string, string>[]>>, source: string): ImportResult {
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

function columnsOf(schema: z.ZodTypeAny): string[] {
  let s = schema;
  while (s instanceof z.ZodEffects) s = s.innerType();
  return Object.keys((s as z.AnyZodObject).shape);
}

export function validateTab<K extends TabName>(tab: K, rows: Record<string, string>[], errors: string[]): TabRows[K] {
  const out: TabRows[K] = [];
  const seen = new Set<string>();
  const expected = columnsOf(schemas[tab]);
  const missing = rows.length ? expected.filter((c) => !(c in rows[0])) : [];
  for (const c of missing) errors.push(`missing column "${c}"`);
  if (missing.length) return out;
  rows.forEach((raw, i) => {
    const line = i + 2; // header is line 1
    const res = schemas[tab].safeParse(raw, { errorMap });
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
  const data = Object.fromEntries(TABS.map((t) => [t, validateTab(t, raw[t] ?? [], errors[t])])) as TabRows;
  crossCheck(data, errors);
  return { data, errors };
}

export function loadCsvDir(dir: string): ImportResult {
  const raw: Partial<Record<TabName, Record<string, string>[]>> = {};
  const missingTabs: TabName[] = [];
  for (const tab of TABS) {
    const file = path.join(dir, `${tab}.csv`);
    if (fs.existsSync(file)) raw[tab] = parseCsv(fs.readFileSync(file, "utf8"));
    else missingTabs.push(tab);
  }
  const result = validateAll(raw);
  for (const tab of missingTabs) if (!OPTIONAL_TABS.includes(tab)) result.errors[tab].push(`file ${tab}.csv not found in ${dir}`);
  return result;
}

export const errorCount = (errors: Record<string, string[]>) => Object.values(errors).reduce((n, e) => n + e.length, 0);
