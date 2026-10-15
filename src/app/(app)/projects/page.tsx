import Link from "next/link";
import { ProjectStatus } from "@/components/ProjectStatus";
import { today } from "@/lib/dates";
import { getDb } from "@/lib/db";
import { isActiveProject, PROJECT_STATUSES, PROJECT_TYPES } from "@/lib/domain";
import { canManageProjects, canSeeFinancials } from "@/lib/permissions";
import { formatMoney } from "@/lib/pipeline";
import { filterProjects, isStale, latestUpdates, marginPct, moneyIn, type ProjectFilter, slippageDays } from "@/lib/projects";
import { displayCurrency, requireView } from "@/lib/session";
import { getSettings, listProjects, listStatusUpdates, listUsers } from "@/lib/store";

export default async function Projects({ searchParams }: { searchParams: Promise<ProjectFilter> }) {
  const user = await requireView("projects");
  const f = await searchParams;
  const status = f.status ?? "active";
  const db = getDb();
  const ccy = await displayCurrency();
  const s = getSettings(db);
  const now = today();
  const all = listProjects(db);
  const latest = latestUpdates(listStatusUpdates(db));
  const names = new Map(listUsers(db).map((u) => [u.email.toLowerCase(), u.name]));
  const rows = filterProjects(all, { ...f, status: status === "all" ? undefined : status });
  const active = all.filter(isActiveProject);
  const drafts = all.filter((p) => p.is_draft);
  const options = (field: "client_name" | "project_lead_email") => [...new Set(all.map((p) => p[field]).filter(Boolean))].sort();
  const anyFinancials = rows.some((p) => canSeeFinancials(user, p));

  return (
    <>
      <div className="head">
        <div>
          <h1>Projects</h1>
          <p className="sub" style={{ margin: 0 }}>
            {active.length} active · {active.filter((p) => p.status === "At risk").length} at risk · {active.filter((p) => p.status === "Off track").length} off track
            {anyFinancials && ` · values in ${ccy}`}
          </p>
        </div>
        {canManageProjects(user) && <Link className="btn primary" href="/projects/new">New project</Link>}
      </div>

      {canManageProjects(user) && drafts.length > 0 && (
        <div className="notice">
          {drafts.length} draft {drafts.length === 1 ? "project" : "projects"} from Closed-Won deals {drafts.length === 1 ? "needs" : "need"} setting up:{" "}
          {drafts.map((d, i) => (
            <span key={d.project_id}>{i > 0 && ", "}<Link href={`/projects/${d.project_id}/edit`}>{d.project_name}</Link></span>
          ))}
        </div>
      )}

      <form className="filters card" method="get">
        <label className="f">
          Status
          <select name="status" defaultValue={status}>
            <option value="active">Active (not completed or on hold)</option>
            <option value="all">All</option>
            {PROJECT_STATUSES.map((st) => <option key={st}>{st}</option>)}
            <option value="Draft">Draft</option>
          </select>
        </label>
        <label className="f">
          Type
          <select name="type" defaultValue={f.type ?? ""}>
            <option value="">All</option>
            {PROJECT_TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </label>
        <label className="f">
          Client
          <select name="client" defaultValue={f.client ?? ""}>
            <option value="">All</option>
            {options("client_name").map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
        <label className="f">
          Lead
          <select name="lead" defaultValue={f.lead ?? ""}>
            <option value="">All</option>
            {options("project_lead_email").map((e) => <option key={e} value={e}>{names.get(e) ?? e}</option>)}
          </select>
        </label>
        <label className="f">Search<input name="q" defaultValue={f.q ?? ""} placeholder="Name, client, ID" /></label>
        <div className="actions">
          <button className="btn" type="submit">Apply</button>
          <Link href="/projects" className="small">Clear</Link>
        </div>
      </form>

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Project</th>
                <th>Status</th>
                <th className="num">Progress</th>
                <th>Planned end</th>
                <th>Forecast end</th>
                {anyFinancials && (
                  <>
                    <th className="num">Value</th>
                    <th className="num">Cost</th>
                    <th className="num">Margin</th>
                  </>
                )}
                <th>Lead</th>
                <th>Last update</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const slip = slippageDays(p);
                const u = latest.get(p.project_id);
                const fin = canSeeFinancials(user, p);
                const m = marginPct(p);
                const money = (v: number | null) => (v === null ? "–" : formatMoney(moneyIn(v, p.currency, ccy, s)!, ccy));
                return (
                  <tr key={p.project_id}>
                    <td className="muted">{p.project_id}</td>
                    <td>
                      <Link href={`/projects/${p.project_id}`}>{p.project_name}</Link>
                      <div className="small muted">{p.client_name} · {p.project_type}</div>
                    </td>
                    <td><ProjectStatus status={p.status} draft={!!p.is_draft} /></td>
                    <td className="num">
                      {p.progress_pct}%
                      <div className="progress" aria-hidden><span style={{ width: `${p.progress_pct}%` }} /></div>
                    </td>
                    <td>{p.planned_end_date || "–"}</td>
                    <td>
                      {p.forecast_end_date || "–"} {slip > 0 && <span className="flag slip" title="Forecast end is past the planned end">+{slip} days</span>}
                    </td>
                    {anyFinancials && (
                      fin ? (
                        <>
                          <td className="num">{money(p.project_value)}</td>
                          <td className="num">{money(p.project_cost)}</td>
                          <td className="num">{m === null ? "–" : `${m}%`}</td>
                        </>
                      ) : (
                        <td colSpan={3} className="muted small">Not your project</td>
                      )
                    )}
                    <td>{names.get(p.project_lead_email) ?? (p.project_lead_email || "–")}</td>
                    <td>
                      {u ? <span title={u.summary}>{u.week_start}</span> : <span className="muted">None</span>}{" "}
                      {isStale(p, u, s, now) && <span className="flag stale">Stale</span>}
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr><td colSpan={11} className="muted">No projects match these filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="small muted" style={{ marginBottom: 0 }}>
          Margin is (value − cost) ÷ value unless entered manually. Stale means no weekly update for more than {s.stale_update_days} days.
        </p>
      </div>
    </>
  );
}
