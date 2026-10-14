// Pure delivery calculations. No I/O, so everything here is unit tested with a fixed "today".
import {
  type Assignment,
  type Currency,
  type ExpectedTeam,
  isActiveProject,
  type Project,
  type Resource,
  type Settings,
  type StatusUpdate,
} from "./domain";
import { convert, daysBetween, iso, type Rag } from "./pipeline";

/** Margin %: entered manually, else (value − cost) / value. Null when there is nothing to compute from. */
export function marginPct(p: Pick<Project, "margin_pct" | "project_value" | "project_cost">): number | null {
  if (p.margin_pct !== null && p.margin_pct !== undefined) return p.margin_pct;
  if (!p.project_value || p.project_cost === null || p.project_cost === undefined) return null;
  return Math.round(((p.project_value - p.project_cost) / p.project_value) * 1000) / 10;
}

/** Days the forecast end date is past the planned end date (0 when on plan or not forecast). */
export function slippageDays(p: Pick<Project, "planned_end_date" | "forecast_end_date">): number {
  if (!p.planned_end_date || !p.forecast_end_date) return 0;
  return Math.max(0, daysBetween(p.planned_end_date, p.forecast_end_date));
}

export const moneyIn = (amount: number | null, from: Currency, to: Currency, s: Pick<Settings, "usd_to_sar_rate">) =>
  amount === null ? null : convert(amount, from, to, s.usd_to_sar_rate);

/** Latest weekly update per project. */
export function latestUpdates(updates: StatusUpdate[]): Map<string, StatusUpdate> {
  const out = new Map<string, StatusUpdate>();
  for (const u of updates) {
    const cur = out.get(u.project_id);
    if (!cur || u.week_start > cur.week_start) out.set(u.project_id, u);
  }
  return out;
}

const addDays = (d: string, n: number) => iso(new Date(Date.parse(d) + n * 86_400_000));

/**
 * An active project's update is stale when its latest weekly update covers a week that ended more than
 * `stale_update_days` ago, or when it has started and has no update at all.
 */
export function isStale(p: Project, latest: StatusUpdate | undefined, s: Pick<Settings, "stale_update_days">, today: string): boolean {
  if (!isActiveProject(p)) return false;
  if (!latest) return !!p.start_date && p.start_date <= today;
  return daysBetween(addDays(latest.week_start, 6), today) > s.stale_update_days;
}

export type DeliveryHealth = { rag: Rag; reason: string; offTrack: number; atRisk: number; active: number };

/** Delivery RAG: Red if any active project is Off track, Amber if any is At risk, else Green. */
export function deliveryHealth(projects: Project[]): DeliveryHealth {
  const active = projects.filter(isActiveProject);
  const offTrack = active.filter((p) => p.status === "Off track").length;
  const atRisk = active.filter((p) => p.status === "At risk").length;
  const rag: Rag = offTrack ? "Red" : atRisk ? "Amber" : "Green";
  const reason = !active.length
    ? "No active projects"
    : offTrack || atRisk
      ? [offTrack && `${offTrack} off track`, atRisk && `${atRisk} at risk`].filter(Boolean).join(", ") + ` of ${active.length} active`
      : `All ${active.length} active projects on track`;
  return { rag, reason, offTrack, atRisk, active: active.length };
}

export type TeamRow = { profile: string; expectedFte: number; assignedFte: number; gapFte: number; people: string[] };

const round1 = (n: number) => Math.round(n * 10) / 10;
const overlaps = (aFrom: string, aTo: string, bFrom: string, bTo: string) => aFrom <= bTo && bFrom <= aTo;

/**
 * Expected vs assigned team by profile, in FTEs, on a given date (default: today, clamped into the
 * project's dates so finished or future projects still show their plan).
 * Expected = quantity × allocation %; assigned = allocation % of people with that profile on the project.
 */
export function teamCoverage(
  project: Project,
  expected: ExpectedTeam[],
  assignments: Assignment[],
  resources: Resource[],
  today: string,
): TeamRow[] {
  const byId = new Map(resources.map((r) => [r.resource_id, r]));
  let on = today;
  if (project.start_date && on < project.start_date) on = project.start_date;
  const end = project.forecast_end_date || project.planned_end_date;
  if (end && on > end) on = end;
  const rows = new Map<string, TeamRow>();
  const row = (profile: string) => {
    if (!rows.has(profile)) rows.set(profile, { profile, expectedFte: 0, assignedFte: 0, gapFte: 0, people: [] });
    return rows.get(profile)!;
  };
  for (const e of expected) {
    if (e.project_id !== project.project_id || !overlaps(e.needed_from, e.needed_to, on, on)) continue;
    row(e.profile).expectedFte += (e.quantity * e.allocation_pct) / 100;
  }
  for (const a of assignments) {
    if (a.project_id !== project.project_id || !overlaps(a.assigned_from, a.assigned_to, on, on)) continue;
    const r = byId.get(a.resource_id);
    const t = row(r?.profile ?? "Unknown profile");
    t.assignedFte += a.allocation_pct / 100;
    t.people.push(`${r?.full_name ?? a.resource_id} (${a.allocation_pct}%)`);
  }
  return [...rows.values()]
    .map((t) => ({ ...t, expectedFte: round1(t.expectedFte), assignedFte: round1(t.assignedFte), gapFte: round1(t.expectedFte - t.assignedFte) }))
    .sort((a, b) => b.expectedFte - a.expectedFte || a.profile.localeCompare(b.profile));
}

export type ProjectFilter = { status?: string; type?: string; client?: string; lead?: string; q?: string };

export function filterProjects(projects: Project[], f: ProjectFilter): Project[] {
  const q = f.q?.trim().toLowerCase();
  return projects.filter(
    (p) =>
      (!f.status || (f.status === "active" ? isActiveProject(p) : f.status === "Draft" ? !!p.is_draft : p.status === f.status && !p.is_draft)) &&
      (!f.type || p.project_type === f.type) &&
      (!f.client || p.client_name === f.client) &&
      (!f.lead || p.project_lead_email === f.lead) &&
      (!q || [p.project_id, p.project_name, p.client_name].some((v) => v.toLowerCase().includes(q))),
  );
}
