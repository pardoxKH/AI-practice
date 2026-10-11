// Loads the input tabs (one CSV per tab, as exported from the Google Sheet) and validates them
// against input-files-schema.md v2. Each tab gets its own error list; nothing is silently dropped.
import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";
import { z } from "zod";
import { ALL_STAGES, CURRENCIES, EMPLOYMENT_TYPES, RESOURCE_STATUSES, ROLES } from "./domain";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be a YYYY-MM-DD date").refine((v) => !Number.isNaN(Date.parse(v)), "is not a real date");
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
} as const;

export type TabName = keyof typeof schemas;
export type TabRows = { [K in TabName]: z.output<(typeof schemas)[K]>[] };
export type ImportResult = { data: TabRows; errors: Record<TabName, string[]> };

/** Tabs loaded in Phase 1, in dependency order. */
export const TABS = Object.keys(schemas) as TabName[];
const ID_COLUMN: Partial<Record<TabName, string>> = {
  users: "email",
  profiles: "profile",
  settings: "key",
  resources: "resource_id",
  opportunities: "opportunity_id",
  projects: "project_id",
};

export function parseCsv(content: string): Record<string, string>[] {
  return parse(content, { columns: true, skip_empty_lines: true, trim: true, bom: true });
}

export function validateTab<K extends TabName>(tab: K, rows: Record<string, string>[], errors: string[]): TabRows[K] {
  const out: TabRows[K] = [];
  const seen = new Set<string>();
  const expected = Object.keys(schemas[tab].shape);
  const missing = rows.length ? expected.filter((c) => !(c in rows[0])) : [];
  for (const c of missing) errors.push(`missing column "${c}"`);
  if (missing.length) return out;
  rows.forEach((raw, i) => {
    const line = i + 2; // header is line 1
    const res = schemas[tab].safeParse(raw);
    if (!res.success) {
      for (const issue of res.error.issues) errors.push(`row ${line}: ${issue.path.join(".")} ${issue.message}`);
      return;
    }
    const idCol = ID_COLUMN[tab];
    const id = idCol ? String((res.data as Record<string, unknown>)[idCol]).toLowerCase() : "";
    if (idCol && seen.has(id)) {
      errors.push(`row ${line}: duplicate ${idCol} "${(res.data as Record<string, unknown>)[idCol]}"`);
      return;
    }
    seen.add(id);
    (out as unknown[]).push(res.data);
  });
  return out;
}

/** Cross-tab checks: profiles, presales resource IDs and opportunity links must point at real rows. */
function crossCheck(data: TabRows, errors: Record<TabName, string[]>) {
  const profiles = new Set(data.profiles.map((p) => p.profile));
  const resourceIds = new Set(data.resources.map((r) => r.resource_id));
  const oppIds = new Set(data.opportunities.map((o) => o.opportunity_id));
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
  for (const tab of missingTabs) if (tab !== "projects" && tab !== "profiles") result.errors[tab].push(`file ${tab}.csv not found in ${dir}`);
  return result;
}

export const errorCount = (errors: Record<string, string[]>) => Object.values(errors).reduce((n, e) => n + e.length, 0);
