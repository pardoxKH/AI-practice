// Pure pipeline calculations. No I/O, so everything here is unit tested with a fixed "today".
import {
  ALL_STAGES,
  type Currency,
  isOpen,
  type Opportunity,
  OPEN_STAGES,
  OUTCOMES,
  PIPELINE_STAGES,
  type Settings,
  type Stage,
  WON_STAGE,
} from "./domain";

const DAY_MS = 86_400_000;

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(toIso) - Date.parse(fromIso)) / DAY_MS);
}

/** Days since the opportunity entered its current stage. */
export const stageAgeDays = (o: Opportunity, today: string) => Math.max(0, daysBetween(o.stage_entered_date, today));

/** Converts an amount between USD and SAR using the admin-maintained rate (SAR per 1 USD). */
export function convert(amount: number, from: Currency, to: Currency, usdToSar: number): number {
  if (from === to) return amount;
  return from === "USD" ? amount * usdToSar : amount / usdToSar;
}

export const valueIn = (o: Opportunity, to: Currency, s: Pick<Settings, "usd_to_sar_rate">) =>
  convert(o.opportunity_value, o.currency, to, s.usd_to_sar_rate);

export function quarterBounds(today: string): { start: string; end: string; label: string } {
  const [y, m] = today.split("-").map(Number);
  const q = Math.floor((m - 1) / 3);
  const start = new Date(Date.UTC(y, q * 3, 1));
  const end = new Date(Date.UTC(y, q * 3 + 3, 0));
  return { start: iso(start), end: iso(end), label: `Q${q + 1} ${y}` };
}

export const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Monday of the ISO week containing `today`. Used as the weekly snapshot key. */
export function weekStart(today: string): string {
  const d = new Date(`${today}T00:00:00Z`);
  const offset = (d.getUTCDay() + 6) % 7;
  return iso(new Date(d.getTime() - offset * DAY_MS));
}

export const isOverdue = (o: Opportunity, today: string) => isOpen(o.stage) && o.expected_close_date < today;
export const isAging = (o: Opportunity, today: string, s: Pick<Settings, "stage_aging_alert_days">) =>
  isOpen(o.stage) && stageAgeDays(o, today) > s.stage_aging_alert_days;

export type StageRow = { stage: Stage; count: number; value: number; avgAgeDays: number };

export function byStage(opps: Opportunity[], ccy: Currency, s: Settings, today: string): StageRow[] {
  return ALL_STAGES.map((stage) => {
    const rows = opps.filter((o) => o.stage === stage);
    const value = rows.reduce((t, o) => t + valueIn(o, ccy, s), 0);
    const avgAgeDays = rows.length ? Math.round(rows.reduce((t, o) => t + stageAgeDays(o, today), 0) / rows.length) : 0;
    return { stage, count: rows.length, value, avgAgeDays };
  });
}

export type GroupRow = { key: string; count: number; openValue: number; wonValue: number };

/** Open and won value per partner or BD manager, largest open value first. */
export function groupBy(
  opps: Opportunity[],
  field: "partner" | "bd_manager" | "client_name",
  ccy: Currency,
  s: Settings,
): GroupRow[] {
  const map = new Map<string, GroupRow>();
  for (const o of opps) {
    const key = o[field] || "(none)";
    const row = map.get(key) ?? { key, count: 0, openValue: 0, wonValue: 0 };
    row.count++;
    if (isOpen(o.stage)) row.openValue += valueIn(o, ccy, s);
    if (o.stage === WON_STAGE) row.wonValue += valueIn(o, ccy, s);
    map.set(key, row);
  }
  return [...map.values()].sort((a, b) => b.openValue - a.openValue || b.wonValue - a.wonValue);
}

export type PipelineKpis = {
  openCount: number;
  openValue: number;
  closingThisQuarterCount: number;
  closingThisQuarterValue: number;
  quarterLabel: string;
  wonYtdCount: number;
  wonYtdValue: number;
  overdueCount: number;
  agingCount: number;
  onHoldCount: number;
  lostYtdCount: number;
};

export function pipelineKpis(opps: Opportunity[], ccy: Currency, s: Settings, today: string): PipelineKpis {
  const q = quarterBounds(today);
  const year = today.slice(0, 4);
  const open = opps.filter((o) => isOpen(o.stage));
  const closing = open.filter((o) => o.expected_close_date >= q.start && o.expected_close_date <= q.end);
  const wonYtd = opps.filter((o) => o.stage === WON_STAGE && o.stage_entered_date.startsWith(year));
  const sum = (rows: Opportunity[]) => rows.reduce((t, o) => t + valueIn(o, ccy, s), 0);
  return {
    openCount: open.length,
    openValue: sum(open),
    closingThisQuarterCount: closing.length,
    closingThisQuarterValue: sum(closing),
    quarterLabel: q.label,
    wonYtdCount: wonYtd.length,
    wonYtdValue: sum(wonYtd),
    overdueCount: open.filter((o) => isOverdue(o, today)).length,
    agingCount: open.filter((o) => isAging(o, today, s)).length,
    onHoldCount: opps.filter((o) => o.stage === "On hold").length,
    lostYtdCount: opps.filter((o) => o.stage === "Lost" && o.stage_entered_date.startsWith(year)).length,
  };
}

export type Rag = "Green" | "Amber" | "Red";

export type GrowthHealth = { rag: Rag; reason: string; atRiskShare: number };

/**
 * Growth RAG (tracker default, tune with Tariq):
 * at-risk share = value of open deals that are overdue or aging / total open value.
 * Green below 15%, Amber below 35%, Red at 35% or more, or when there is no open pipeline at all.
 */
export function growthHealth(opps: Opportunity[], s: Settings, today: string): GrowthHealth {
  const open = opps.filter((o) => isOpen(o.stage));
  const total = open.reduce((t, o) => t + valueIn(o, "USD", s), 0);
  if (total === 0) return { rag: "Red", reason: "No open pipeline", atRiskShare: 1 };
  const atRisk = open
    .filter((o) => isOverdue(o, today) || isAging(o, today, s))
    .reduce((t, o) => t + valueIn(o, "USD", s), 0);
  const share = atRisk / total;
  const pct = Math.round(share * 100);
  const rag: Rag = share < 0.15 ? "Green" : share < 0.35 ? "Amber" : "Red";
  return { rag, atRiskShare: share, reason: `${pct}% of open pipeline value is overdue or aging` };
}

export type Attention = { opportunity: Opportunity; kind: "Overdue" | "Aging"; detail: string };

/** Needs-attention items for the pipeline: past expected close first, then longest in stage. */
export function needsAttention(opps: Opportunity[], s: Settings, today: string): Attention[] {
  const out: Attention[] = [];
  for (const o of opps) {
    if (isOverdue(o, today)) {
      out.push({ opportunity: o, kind: "Overdue", detail: `${daysBetween(o.expected_close_date, today)} days past expected close` });
    } else if (isAging(o, today, s)) {
      out.push({ opportunity: o, kind: "Aging", detail: `${stageAgeDays(o, today)} days in stage` });
    }
  }
  const rank = (a: Attention) => (a.kind === "Overdue" ? 0 : 1);
  return out.sort((a, b) => rank(a) - rank(b) || stageAgeDays(b.opportunity, today) - stageAgeDays(a.opportunity, today));
}

export type OppFilter = { stage?: string; client?: string; partner?: string; bd?: string; q?: string };

export function filterOpps(opps: Opportunity[], f: OppFilter): Opportunity[] {
  const q = f.q?.trim().toLowerCase();
  return opps.filter(
    (o) =>
      (!f.stage || (f.stage === "open" ? isOpen(o.stage) : o.stage === f.stage)) &&
      (!f.client || o.client_name === f.client) &&
      (!f.partner || o.partner === f.partner) &&
      (!f.bd || o.bd_manager === f.bd) &&
      (!q || `${o.opportunity_id} ${o.opportunity_name} ${o.client_name} ${o.notes}`.toLowerCase().includes(q)),
  );
}

export const stageIndex = (stage: Stage) => (PIPELINE_STAGES as readonly string[]).indexOf(stage);
export { OPEN_STAGES, OUTCOMES, PIPELINE_STAGES };

export function formatMoney(amount: number, ccy: Currency): string {
  const abs = Math.abs(amount);
  const short =
    abs >= 1e6 ? `${(amount / 1e6).toFixed(abs >= 1e7 ? 0 : 1)}M` : abs >= 1e3 ? `${Math.round(amount / 1e3)}K` : `${Math.round(amount)}`;
  return `${ccy} ${short}`;
}

export const formatMoneyFull = (amount: number, ccy: Currency) =>
  `${ccy} ${Math.round(amount).toLocaleString("en-US")}`;
