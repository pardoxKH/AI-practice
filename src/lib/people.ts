// Pure people calculations: planned allocation (forward-looking, from project_assignments) and
// utilization (backward-looking, the ops team's overall % per person). No I/O.
import type { Assignment, Engagement, Opportunity, Project, Resource, Settings, UtilizationRow } from "./domain";
import { iso, type Rag, weekStart } from "./pipeline";

const DAY_MS = 86_400_000;
const addDays = (d: string, n: number) => iso(new Date(Date.parse(d) + n * DAY_MS));

/** `n` consecutive Mondays starting with the week that contains `from`. */
export function weeksFrom(from: string, n: number): string[] {
  const first = weekStart(from);
  return Array.from({ length: n }, (_, i) => addDays(first, i * 7));
}

/** An assignment counts toward a week when its dates overlap that Monday-to-Sunday week at all. */
const inWeek = (a: Assignment, week: string) => a.assigned_from <= addDays(week, 6) && a.assigned_to >= week;

export const allocationInWeek = (assignments: Assignment[], resourceId: string, week: string) =>
  assignments.filter((a) => a.resource_id === resourceId && inWeek(a, week)).reduce((t, a) => t + a.allocation_pct, 0);

/** People who are planned to work: active, not on leave or exited. */
export const capacity = (resources: Resource[]) => resources.filter((r) => r.status === "Active");

export type PlanRow = { resource: Resource; weeks: number[]; freeNow: number };

/** Planned allocation % per person per week, for availability ("who is free and when"). */
export function planGrid(resources: Resource[], assignments: Assignment[], weeks: string[]): PlanRow[] {
  return capacity(resources).map((resource) => {
    const w = weeks.map((wk) => allocationInWeek(assignments, resource.resource_id, wk));
    return { resource, weeks: w, freeNow: Math.max(0, 100 - (w[0] ?? 0)) };
  });
}

export type OverAllocation = { resource: Resource; firstWeek: string; peakPct: number; weeksOver: number };

/** Anyone whose planned allocations add up to more than 100% in any of the given weeks. */
export function overAllocations(resources: Resource[], assignments: Assignment[], weeks: string[]): OverAllocation[] {
  const out: OverAllocation[] = [];
  for (const row of planGrid(resources, assignments, weeks)) {
    const over = row.weeks.map((pct, i) => ({ pct, week: weeks[i] })).filter((x) => x.pct > 100);
    if (over.length) out.push({ resource: row.resource, firstWeek: over[0].week, peakPct: Math.max(...over.map((x) => x.pct)), weeksOver: over.length });
  }
  return out.sort((a, b) => b.peakPct - a.peakPct);
}

/** Client projects and POCs are Project time, accelerators Investment, opportunity assignments Presales. */
export function engagementOf(a: Assignment, projects: Map<string, Project>, opps: Map<string, Opportunity>): { engagement: Engagement; client: string } {
  if (a.opportunity_id) return { engagement: "Presales", client: opps.get(a.opportunity_id)?.client_name ?? a.opportunity_id };
  const p = projects.get(a.project_id);
  if (!p) return { engagement: "Project", client: a.project_id };
  return { engagement: p.project_type === "Accelerator" ? "Investment" : "Project", client: p.client_name };
}

export type Split = { byEngagement: Record<Engagement, number>; byClient: { client: string; engagement: Engagement; fte: number }[]; people: number };

/**
 * Planned split of the active team's capacity in one week, in FTEs. Each active person is one FTE;
 * whatever their allocations don't cover is Bench (over-allocation is not counted twice).
 */
export function engagementSplit(resources: Resource[], assignments: Assignment[], projects: Project[], opps: Opportunity[], week: string): Split {
  const pMap = new Map(projects.map((p) => [p.project_id, p]));
  const oMap = new Map(opps.map((o) => [o.opportunity_id, o]));
  const byEngagement: Record<Engagement, number> = { Project: 0, Investment: 0, Presales: 0, Bench: 0 };
  const clients = new Map<string, { client: string; engagement: Engagement; fte: number }>();
  const people = capacity(resources);
  for (const r of people) {
    const mine = assignments.filter((a) => a.resource_id === r.resource_id && inWeek(a, week));
    const total = mine.reduce((t, a) => t + a.allocation_pct, 0);
    const scale = total > 100 ? 100 / total : 1;
    for (const a of mine) {
      const { engagement, client } = engagementOf(a, pMap, oMap);
      const fte = (a.allocation_pct * scale) / 100;
      byEngagement[engagement] += fte;
      const key = `${engagement}|${client}`;
      const c = clients.get(key) ?? { client, engagement, fte: 0 };
      c.fte += fte;
      clients.set(key, c);
    }
    byEngagement.Bench += Math.max(0, 100 - total) / 100;
  }
  const r1 = (n: number) => Math.round(n * 10) / 10;
  for (const k of Object.keys(byEngagement) as Engagement[]) byEngagement[k] = r1(byEngagement[k]);
  const byClient = [...clients.values()].map((c) => ({ ...c, fte: r1(c.fte) })).sort((a, b) => b.fte - a.fte);
  return { byEngagement, byClient, people: people.length };
}

// ---------- utilization (ops report) ----------

export type PeriodType = UtilizationRow["period_type"];

/** Week when the report has weekly rows, else Month. */
export const defaultPeriodType = (rows: UtilizationRow[]): PeriodType => (rows.some((r) => r.period_type === "Week") || !rows.length ? "Week" : "Month");

export const periodsOf = (rows: UtilizationRow[], type: PeriodType) =>
  [...new Set(rows.filter((r) => r.period_type === type).map((r) => r.period_start))].sort();

/** email (lower case) → period_start → utilization %. */
export function utilizationGrid(rows: UtilizationRow[], type: PeriodType): Map<string, Map<string, number>> {
  const grid = new Map<string, Map<string, number>>();
  for (const r of rows) {
    if (r.period_type !== type) continue;
    const e = r.email.toLowerCase();
    if (!grid.has(e)) grid.set(e, new Map());
    grid.get(e)!.set(r.period_start, r.utilization_pct);
  }
  return grid;
}

export type PracticeUtilization = { pct: number | null; period: string | null; people: number };

/**
 * Practice utilization for one period: the average overall % of FTEs who are not exited and have a row
 * for it. Trainees are shown in the heatmap but not counted here.
 */
export function practiceUtilization(rows: UtilizationRow[], resources: Resource[], type: PeriodType, period?: string): PracticeUtilization {
  const p = period ?? periodsOf(rows, type).at(-1) ?? null;
  if (!p) return { pct: null, period: null, people: 0 };
  const ftes = new Set(resources.filter((r) => r.employment_type === "FTE" && r.status !== "Exited").map((r) => r.email.toLowerCase()));
  const vals = rows.filter((r) => r.period_type === type && r.period_start === p && ftes.has(r.email.toLowerCase())).map((r) => r.utilization_pct);
  if (!vals.length) return { pct: null, period: p, people: 0 };
  return { pct: Math.round(vals.reduce((t, v) => t + v, 0) / vals.length), period: p, people: vals.length };
}

/** People (not exited) whose utilization in the period is below the unutilized threshold. */
export function underUtilized(rows: UtilizationRow[], resources: Resource[], s: Pick<Settings, "underutilized_below_pct">, type: PeriodType, period: string | null) {
  if (!period) return [];
  const byEmail = new Map(resources.filter((r) => r.status !== "Exited").map((r) => [r.email.toLowerCase(), r]));
  return rows
    .filter((r) => r.period_type === type && r.period_start === period && r.utilization_pct < s.underutilized_below_pct && byEmail.has(r.email.toLowerCase()))
    .map((r) => ({ resource: byEmail.get(r.email.toLowerCase())!, pct: r.utilization_pct }))
    .sort((a, b) => a.pct - b.pct);
}

/** Emails in the ops report that match no one in the resource master list. */
export function unknownEmails(rows: UtilizationRow[], resources: Resource[]): string[] {
  const known = new Set(resources.map((r) => r.email.toLowerCase()));
  return [...new Set(rows.map((r) => r.email.toLowerCase()).filter((e) => !known.has(e)))].sort();
}

export type PeopleHealth = { rag: Rag | "Pending"; reason: string };

/** People RAG: Green at or above target, Amber within 10 points of it, Red below that. */
export function peopleHealth(u: PracticeUtilization, s: Pick<Settings, "utilization_target_pct">): PeopleHealth {
  if (u.pct === null) return { rag: "Pending", reason: "No utilization report loaded yet" };
  const rag: Rag = u.pct >= s.utilization_target_pct ? "Green" : u.pct >= s.utilization_target_pct - 10 ? "Amber" : "Red";
  return { rag, reason: `${u.pct}% FTE utilization (${u.period}) vs ${s.utilization_target_pct}% target` };
}
