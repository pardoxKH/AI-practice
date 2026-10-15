// Placeholder dates for opportunities whose dates aren't known yet, so an early version of the app can run on
// real deals. The dates are random but repeatable (seeded by opportunity_id), fall inside the given year, and are
// flagged in the notes so nobody mistakes them for real ones.
import { isOpen, type Stage } from "./domain";

export const PLACEHOLDER_NOTE = "[placeholder dates]";
const DATE_COLS = ["initiation_date", "stage_entered_date", "expected_close_date"] as const;
const DAY_MS = 86_400_000;

/** Small deterministic PRNG (mulberry32) seeded from a string. */
function rng(seed: string) {
  let h = 1779033703;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 3432918353) >>> 0;
  return () => {
    h = (h + 0x6d2b79f5) >>> 0;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const toDay = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / DAY_MS;
const fromDay = (d: number) => new Date(Math.round(d) * DAY_MS).toISOString().slice(0, 10);

/**
 * Fills blank opportunity dates within `year`: initiation <= stage entered <= today, and expected close after the
 * stage was entered (later than today for open deals, so they read as upcoming). Dates already filled in are kept.
 * Returns the rows (copied) and how many were changed.
 */
export function fillOpportunityDates(rows: Record<string, string>[], year: number, today: string) {
  const start = toDay(`${year}-01-01`);
  const end = toDay(`${year}-12-31`);
  const now = Math.min(Math.max(toDay(today), start), end);
  let filled = 0;
  const out = rows.map((row) => {
    if (DATE_COLS.every((c) => row[c])) return row;
    const r = rng(row.opportunity_id || row.opportunity_name || "");
    const pick = (lo: number, hi: number) => lo + Math.floor(r() * (Math.max(hi, lo) - lo + 1));
    const given = (c: (typeof DATE_COLS)[number]) => (row[c] ? toDay(row[c]) : undefined);
    const initiation = given("initiation_date") ?? pick(start, now - 30);
    const entered = given("stage_entered_date") ?? pick(initiation, now);
    const open = isOpen(row.stage as Stage);
    const close = given("expected_close_date") ?? (open ? pick(Math.max(entered, now) + 1, end) : pick(entered, Math.min(entered + 30, now)));
    filled++;
    return {
      ...row,
      initiation_date: fromDay(initiation),
      stage_entered_date: fromDay(entered),
      expected_close_date: fromDay(close),
      notes: row.notes?.includes(PLACEHOLDER_NOTE) ? row.notes : `${row.notes ? `${row.notes} ` : ""}${PLACEHOLDER_NOTE}`,
    };
  });
  return { rows: out, filled };
}
