import Link from "next/link";
import { Bars } from "@/components/Bars";
import { MissingInfoFlag } from "@/components/MissingInfo";
import { today } from "@/lib/dates";
import { getDb } from "@/lib/db";
import { ALL_STAGES, isOpen, OUTCOMES, PIPELINE_STAGES, STAGE_SHORT } from "@/lib/domain";
import { canEdit } from "@/lib/permissions";
import {
  byStage,
  filterOpps,
  formatMoney,
  groupBy,
  isAging,
  isOverdue,
  type OppFilter,
  stageAgeDays,
  stageIndex,
  valueIn,
} from "@/lib/pipeline";
import { displayCurrency, requireView } from "@/lib/session";
import { hasIssues } from "@/lib/issues";
import { getSettings, listOpportunities } from "@/lib/store";

export default async function Pipeline({ searchParams }: { searchParams: Promise<OppFilter> }) {
  const user = await requireView("opportunities");
  const f = await searchParams;
  const db = getDb();
  const ccy = await displayCurrency();
  const s = getSettings(db);
  const now = today();
  const all = listOpportunities(db);
  // Funnel and breakdowns respect every filter except stage, so the funnel always shows all stages.
  const scoped = filterOpps(all, { ...f, stage: undefined });
  const rows = filterOpps(all, f).sort(
    (a, b) => stageOrder(a.stage) - stageOrder(b.stage) || a.expected_close_date.localeCompare(b.expected_close_date),
  );
  const stages = byStage(scoped, ccy, s, now);
  const funnel = stages.filter((r) => (PIPELINE_STAGES as readonly string[]).includes(r.stage));
  const outcomes = stages.filter((r) => (OUTCOMES as readonly string[]).includes(r.stage));
  const partners = groupBy(scoped, "partner", ccy, s);
  const bds = groupBy(scoped, "bd_manager", ccy, s);
  const options = (field: "client_name" | "partner" | "bd_manager") => [...new Set(all.map((o) => o[field]))].sort();
  const total = rows.reduce((t, o) => t + valueIn(o, ccy, s), 0);
  const incomplete = all.filter(hasIssues).length;

  return (
    <>
      <div className="head">
        <div>
          <h1>Opportunities pipeline</h1>
          <p className="sub" style={{ margin: 0 }}>Values in {ccy}. Aging counts days since the opportunity entered its current stage.</p>
        </div>
        {canEdit(user.role, "opportunities") && (
          <Link className="btn primary" href="/pipeline/new">New opportunity</Link>
        )}
      </div>

      {incomplete > 0 && !f.missing && (
        <div className="notice missing">
          <span aria-hidden>⚠ </span>
          {incomplete} of {all.length} opportunities are missing information (blank or invalid fields, or placeholder dates).{" "}
          <Link href="/pipeline?missing=1">Show only those</Link>
        </div>
      )}

      <form className="filters card" method="get">
        <label className="f">
          Stage
          <select name="stage" defaultValue={f.stage ?? ""}>
            <option value="">All stages</option>
            <option value="open">Open (stages 1-5)</option>
            {ALL_STAGES.map((st) => (
              <option key={st} value={st}>{st}</option>
            ))}
          </select>
        </label>
        <Select name="client" label="Client" value={f.client} options={options("client_name")} />
        <Select name="partner" label="Partner" value={f.partner} options={options("partner")} />
        <Select name="bd" label="BD manager" value={f.bd} options={options("bd_manager")} />
        <label className="f">
          Data
          <select name="missing" defaultValue={f.missing ?? ""}>
            <option value="">All</option>
            <option value="1">Missing info only</option>
          </select>
        </label>
        <label className="f">
          Search
          <input name="q" defaultValue={f.q ?? ""} placeholder="Name, client, notes" />
        </label>
        <div className="actions">
          <button className="btn" type="submit">Apply</button>
          <Link href="/pipeline" className="small">Clear</Link>
        </div>
      </form>

      <div className="grid two">
        <div className="card">
          <h2>Funnel by stage</h2>
          <Bars
            ariaLabel="Opportunity value by stage"
            rows={funnel.map((r) => ({
              label: STAGE_SHORT[r.stage],
              value: r.value,
              display: `${formatMoney(r.value, ccy)} · ${r.count}`,
              tooltip: `${r.stage}: ${r.count} opportunities, ${formatMoney(r.value, ccy)}, average ${r.avgAgeDays} days in stage`,
              href: stageHref(f, r.stage),
              muted: r.stage === "Closed-Won & Delivery Handoff",
            }))}
          />
          <div className="table-wrap section"><table>
            <thead>
              <tr>
                <th>Stage</th>
                <th className="num">Count</th>
                <th className="num">Value</th>
                <th className="num">Avg days in stage</th>
              </tr>
            </thead>
            <tbody>
              {[...funnel, ...outcomes].map((r) => (
                <tr key={r.stage}>
                  <td><Link href={stageHref(f, r.stage)}>{STAGE_SHORT[r.stage]}</Link></td>
                  <td className="num">{r.count}</td>
                  <td className="num">{formatMoney(r.value, ccy)}</td>
                  <td className="num">{r.count ? r.avgAgeDays : "–"}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
        <div className="grid" style={{ alignContent: "start" }}>
          <div className="card">
            <h2>Open value by partner</h2>
            <Bars
              ariaLabel="Open pipeline value by partner"
              rows={partners.map((p) => ({
                label: p.key,
                value: p.openValue,
                display: formatMoney(p.openValue, ccy),
                tooltip: `${p.key}: ${formatMoney(p.openValue, ccy)} open, ${formatMoney(p.wonValue, ccy)} won, ${p.count} opportunities`,
                href: `/pipeline?partner=${encodeURIComponent(p.key)}`,
              }))}
            />
          </div>
          <div className="card">
            <h2>Open value by BD manager</h2>
            <Bars
              ariaLabel="Open pipeline value by BD manager"
              rows={bds.map((p) => ({
                label: p.key,
                value: p.openValue,
                display: formatMoney(p.openValue, ccy),
                tooltip: `${p.key}: ${formatMoney(p.openValue, ccy)} open, ${formatMoney(p.wonValue, ccy)} won, ${p.count} opportunities`,
                href: `/pipeline?bd=${encodeURIComponent(p.key)}`,
              }))}
            />
          </div>
        </div>
      </div>

      <div className="card section">
        <div className="head" style={{ marginBottom: 8 }}>
          <h2 style={{ margin: 0 }}>Opportunities</h2>
          <span className="muted small">{rows.length} shown · {formatMoney(total, ccy)}</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Opportunity</th>
                <th>Stage</th>
                <th className="num">Value</th>
                <th>Partner</th>
                <th>BD manager</th>
                <th className="num">Days in stage</th>
                <th>Expected close</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.opportunity_id}>
                  <td className="muted">{o.opportunity_id}</td>
                  <td>
                    <Link href={`/pipeline/${o.opportunity_id}`}>{o.opportunity_name}</Link> <MissingInfoFlag row={o} />
                    <div className="small muted">{o.client_name}</div>
                  </td>
                  <td>{STAGE_SHORT[o.stage]}</td>
                  <td className="num" title={o.currency !== ccy ? `${o.currency} ${o.opportunity_value.toLocaleString("en-US")}` : undefined}>
                    {formatMoney(valueIn(o, ccy, s), ccy)}
                  </td>
                  <td>{o.partner}</td>
                  <td>{o.bd_manager}</td>
                  <td className="num">
                    {isOpen(o.stage) ? stageAgeDays(o, now) : "–"}{" "}
                    {isAging(o, now, s) && <span className="flag aging">Aging</span>}
                  </td>
                  <td>
                    {o.expected_close_date} {isOverdue(o, now) && <span className="flag overdue">Overdue</span>}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="muted">No opportunities match these filters.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

const stageOrder = (stage: (typeof ALL_STAGES)[number]) => {
  const i = stageIndex(stage);
  return i >= 0 ? i : 10 + OUTCOMES.indexOf(stage as (typeof OUTCOMES)[number]);
};

function stageHref(f: OppFilter, stage: string) {
  const p = new URLSearchParams(Object.entries({ ...f, stage }).filter(([, v]) => v) as [string, string][]);
  return `/pipeline?${p}`;
}

function Select({ name, label, value, options }: { name: string; label: string; value?: string; options: string[] }) {
  return (
    <label className="f">
      {label}
      <select name={name} defaultValue={value ?? ""}>
        <option value="">All</option>
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </label>
  );
}
