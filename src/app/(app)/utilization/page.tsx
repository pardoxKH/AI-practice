import Link from "next/link";
import { importUtilizationAction } from "@/app/actions";
import { ActionForm } from "@/components/ActionForm";
import { Bars } from "@/components/Bars";
import { HeatCell, HeatLegend } from "@/components/HeatCell";
import { today } from "@/lib/dates";
import { getDb } from "@/lib/db";
import { ENGAGEMENTS } from "@/lib/domain";
import {
  defaultPeriodType,
  engagementSplit,
  overAllocations,
  type PeriodType,
  periodsOf,
  planGrid,
  practiceUtilization,
  underUtilized,
  unknownEmails,
  utilizationGrid,
  weeksFrom,
} from "@/lib/people";
import { canEdit } from "@/lib/permissions";
import { requireView } from "@/lib/session";
import { getSettings, listAssignments, listOpportunities, listProjects, listResources, listUtilization } from "@/lib/store";

type F = { type?: string; who?: string; profile?: string };

export default async function Utilization({ searchParams }: { searchParams: Promise<F> }) {
  const user = await requireView("utilization");
  const f = await searchParams;
  const db = getDb();
  const s = getSettings(db);
  const now = today();
  const util = listUtilization(db);
  const type: PeriodType = f.type === "Month" || f.type === "Week" ? f.type : defaultPeriodType(util);
  const periods = periodsOf(util, type).slice(-12);
  const grid = utilizationGrid(util, type);
  const allResources = listResources(db);
  const resources = allResources
    .filter((r) => r.status !== "Exited")
    .filter((r) => !f.profile || r.profile === f.profile)
    .filter((r) => !f.who || (f.who === "Trainee" ? r.employment_type === "Trainee" : r.employment_type === "FTE"))
    .sort((a, b) => a.employment_type.localeCompare(b.employment_type) || a.full_name.localeCompare(b.full_name));
  const practice = practiceUtilization(util, allResources, type);
  const under = underUtilized(util, allResources, s, type, practice.period);
  const assignments = listAssignments(db);
  const weeks = weeksFrom(now, 12);
  const plan = planGrid(resources, assignments, weeks).sort((a, b) => b.freeNow - a.freeNow || a.resource.full_name.localeCompare(b.resource.full_name));
  const over = overAllocations(allResources, assignments, weeks);
  const split = engagementSplit(allResources, assignments, listProjects(db), listOpportunities(db), weeks[0]);
  const unknown = unknownEmails(util, allResources);
  const profiles = [...new Set(allResources.map((r) => r.profile))].sort();
  const ftesInView = new Set(resources.filter((r) => r.employment_type === "FTE").map((r) => r.email.toLowerCase()));
  const avg = (p: string) => {
    const vals = [...ftesInView].map((e) => grid.get(e)?.get(p)).filter((v): v is number => v !== undefined);
    return vals.length ? Math.round(vals.reduce((t, v) => t + v, 0) / vals.length) : undefined;
  };
  const label = (p: string) => (type === "Week" ? p.slice(5) : new Date(`${p}T00:00:00Z`).toLocaleString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" }));

  return (
    <>
      <h1>Utilization and availability</h1>
      <p className="sub">
        Utilization is the ops team&apos;s overall % per person (looking back). Availability and the engagement split come from planned assignments (looking ahead).
      </p>

      <div className="grid kpis">
        <Kpi
          label={`Practice utilization${practice.period ? `, ${type.toLowerCase()} of ${practice.period}` : ""}`}
          value={practice.pct === null ? "–" : `${practice.pct}%`}
          foot={`FTE average vs ${s.utilization_target_pct}% target · ${practice.people} people`}
        />
        <Kpi label={`Below ${s.underutilized_below_pct}%`} value={String(under.length)} foot={under.map((u) => u.resource.full_name).slice(0, 3).join(", ") || "Nobody"} />
        <Kpi label="Over-allocated, next 12 weeks" value={String(over.length)} foot="Planned above 100% in some week" />
        <Kpi label="Bench this week" value={`${split.byEngagement.Bench} FTE`} foot={`of ${split.people} active people`} />
      </div>

      <form className="filters card" method="get">
        <label className="f">
          Period
          <select name="type" defaultValue={type}>
            <option>Week</option>
            <option>Month</option>
          </select>
        </label>
        <label className="f">
          People
          <select name="who" defaultValue={f.who ?? ""}>
            <option value="">FTEs and trainees</option>
            <option value="FTE">FTEs only</option>
            <option value="Trainee">Trainees only</option>
          </select>
        </label>
        <label className="f">
          Profile
          <select name="profile" defaultValue={f.profile ?? ""}>
            <option value="">All</option>
            {profiles.map((p) => <option key={p}>{p}</option>)}
          </select>
        </label>
        <div className="actions">
          <button className="btn" type="submit">Apply</button>
          <Link href="/utilization" className="small">Clear</Link>
        </div>
      </form>

      {unknown.length > 0 && (
        <div className="notice err">
          The ops report has {unknown.length} email{unknown.length === 1 ? "" : "s"} that match nobody in the resource master list, so they aren&apos;t shown: {unknown.join(", ")}.
        </div>
      )}

      <div className="card">
        <h2>Utilization by person ({type === "Week" ? "weekly" : "monthly"}, ops report)</h2>
        {periods.length === 0 ? (
          <p className="muted">No {type.toLowerCase()}ly utilization loaded yet.{canEdit(user.role, "utilization") && " Load the ops report below."}</p>
        ) : (
          <div className="table-wrap">
            <table className="heat">
              <thead>
                <tr>
                  <th>Person</th>
                  {periods.map((p) => <th key={p} className="p" title={`${type} of ${p}`}>{label(p)}</th>)}
                </tr>
              </thead>
              <tbody>
                {resources.map((r) => {
                  const row = grid.get(r.email.toLowerCase());
                  return (
                    <tr key={r.resource_id}>
                      <td className="name">
                        <Link href={`/resources/${r.resource_id}`}>{r.full_name}</Link>{" "}
                        {r.employment_type === "Trainee" && <span className="flag trainee">Trainee</span>}
                        <div className="small muted">{r.profile}</div>
                      </td>
                      {periods.map((p) => {
                        const v = row?.get(p);
                        return <HeatCell key={p} pct={v} title={`${r.full_name}, ${type.toLowerCase()} of ${p}`} under={v !== undefined && v < s.underutilized_below_pct} />;
                      })}
                    </tr>
                  );
                })}
                <tr>
                  <td className="name" style={{ fontWeight: 600 }}>FTE average</td>
                  {periods.map((p) => <HeatCell key={p} pct={avg(p)} title={`FTE average, ${type.toLowerCase()} of ${p}`} under={(avg(p) ?? 100) < s.utilization_target_pct} />)}
                </tr>
              </tbody>
            </table>
            <HeatLegend underLabel={`Below ${s.underutilized_below_pct}% (average row: below the ${s.utilization_target_pct}% target)`} />
          </div>
        )}
      </div>

      <div className="grid two section">
        <div className="card">
          <h2>Planned split this week (FTE)</h2>
          <Bars
            ariaLabel="Planned FTE by engagement type this week"
            rows={ENGAGEMENTS.map((e) => ({
              label: e,
              value: split.byEngagement[e],
              display: `${split.byEngagement[e]} FTE`,
              muted: e === "Bench",
            }))}
          />
          <p className="small muted">Client projects and POCs are Project, accelerators are Investment, opportunity assignments are Presales. Unallocated time is Bench.</p>
          <h2 style={{ marginTop: 16 }}>By client this week</h2>
          <Bars
            ariaLabel="Planned FTE by client this week"
            rows={split.byClient.map((c) => ({ label: c.client, value: c.fte, display: `${c.fte} FTE · ${c.engagement}`, muted: c.engagement !== "Project" }))}
          />
        </div>
        <div className="card">
          <h2>Over-allocated (next 12 weeks)</h2>
          {over.length === 0 ? (
            <p className="muted">Nobody is planned above 100%.</p>
          ) : (
            <table>
              <thead><tr><th>Person</th><th className="num">Peak</th><th>From week</th><th className="num">Weeks over</th></tr></thead>
              <tbody>
                {over.map((o) => (
                  <tr key={o.resource.resource_id}>
                    <td><Link href={`/resources/${o.resource.resource_id}`}>{o.resource.full_name}</Link></td>
                    <td className="num"><span className="flag overdue">{o.peakPct}%</span></td>
                    <td>{o.firstWeek}</td>
                    <td className="num">{o.weeksOver}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <h2 style={{ marginTop: 16 }}>Below {s.underutilized_below_pct}% ({practice.period ?? "no data"})</h2>
          {under.length === 0 ? (
            <p className="muted">Nobody.</p>
          ) : (
            <table>
              <tbody>
                {under.map((u) => (
                  <tr key={u.resource.resource_id}>
                    <td>
                      <Link href={`/resources/${u.resource.resource_id}`}>{u.resource.full_name}</Link>{" "}
                      {u.resource.employment_type === "Trainee" && <span className="flag trainee">Trainee</span>}
                    </td>
                    <td className="num">{u.pct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="card section">
        <h2>Availability: planned allocation for the next 12 weeks</h2>
        <div className="table-wrap">
          <table className="heat">
            <thead>
              <tr>
                <th>Person</th>
                <th className="p">Free now</th>
                {weeks.map((w) => <th key={w} className="p" title={`Week of ${w}`}>{w.slice(5)}</th>)}
              </tr>
            </thead>
            <tbody>
              {plan.map((row) => (
                <tr key={row.resource.resource_id}>
                  <td className="name">
                    <Link href={`/resources/${row.resource.resource_id}`}>{row.resource.full_name}</Link>{" "}
                    {row.resource.employment_type === "Trainee" && <span className="flag trainee">Trainee</span>}
                    <div className="small muted">{row.resource.profile}</div>
                  </td>
                  <td className="c" style={{ fontWeight: 600 }}>{row.freeNow}%</td>
                  {row.weeks.map((pct, i) => <HeatCell key={weeks[i]} pct={pct} title={`${row.resource.full_name}, week of ${weeks[i]} planned`} under={pct > 100} />)}
                </tr>
              ))}
            </tbody>
          </table>
          <HeatLegend underLabel="Planned above 100%" />
        </div>
        <p className="small muted" style={{ marginBottom: 0 }}>Cells show planned allocation %; lighter means more free. Only active people are listed (not on leave or exited).</p>
      </div>

      {canEdit(user.role, "utilization") && (
        <div className="card section">
          <h2>Load the ops utilization report</h2>
          <p className="small muted" style={{ marginTop: 0 }}>
            A .csv or .xlsx with columns email, period_type (Week or Month), period_start, utilization_pct. For a workbook, the
            &quot;utilization&quot; sheet is used, or the first sheet. Every period in the file replaces what was loaded for that period before.
          </p>
          <ActionForm action={importUtilizationAction} submit="Load report">
            <label className="f">File<input name="file" type="file" accept=".csv,.xlsx" required /></label>
          </ActionForm>
        </div>
      )}
    </>
  );
}

function Kpi({ label, value, foot }: { label: string; value: string; foot?: string }) {
  return (
    <div className="card kpi">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {foot && <div className="foot">{foot}</div>}
    </div>
  );
}
