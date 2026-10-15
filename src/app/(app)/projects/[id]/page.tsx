import Link from "next/link";
import { notFound } from "next/navigation";
import {
  addAssignmentAction,
  addExpectedTeamAction,
  addMilestoneAction,
  deleteAssignmentAction,
  deleteExpectedTeamAction,
  setMilestoneActualAction,
} from "@/app/actions";
import { ActionForm } from "@/components/ActionForm";
import { ProjectStatus } from "@/components/ProjectStatus";
import { today } from "@/lib/dates";
import { getDb } from "@/lib/db";
import { canEditProject, canManageProjects, canSeeFinancials, canView } from "@/lib/permissions";
import { formatMoneyFull } from "@/lib/pipeline";
import { isStale, latestUpdates, marginPct, moneyIn, slippageDays, teamCoverage } from "@/lib/projects";
import { displayCurrency, requireView } from "@/lib/session";
import {
  getProject,
  getSettings,
  listAssignments,
  listAudit,
  listExpectedTeam,
  listMilestones,
  listProfiles,
  listResources,
  listStatusUpdates,
  listUsers,
} from "@/lib/store";

type Q = { saved?: string; updated?: string };

export default async function ProjectDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Q> }) {
  const user = await requireView("projects");
  const { id } = await params;
  const q = await searchParams;
  const db = getDb();
  const p = getProject(db, id);
  if (!p) notFound();
  const ccy = await displayCurrency();
  const s = getSettings(db);
  const now = today();
  const editor = canEditProject(user, p);
  const admin = canManageProjects(user);
  const fin = canSeeFinancials(user, p);
  const updates = listStatusUpdates(db, id);
  const latest = latestUpdates(updates).get(id);
  const expected = listExpectedTeam(db, id);
  const assignments = listAssignments(db, { projectId: id });
  const resources = listResources(db);
  const byId = new Map(resources.map((r) => [r.resource_id, r]));
  const team = teamCoverage(p, expected, assignments, resources, now);
  const milestones = listMilestones(db, id);
  const lead = listUsers(db).find((u) => u.email === p.project_lead_email);
  const slip = slippageDays(p);
  const m = marginPct(p);
  const money = (v: number | null) => (v === null ? "–" : formatMoneyFull(moneyIn(v, p.currency, ccy, s)!, ccy));
  const history = canView(user.role, "audit") ? listAudit(db, { entity: "projects", entityId: id, limit: 30 }) : [];
  const docs = [
    ["Project plan", p.plan_link],
    ["Charter", p.charter_link],
    ["Contract", p.contract_link],
    ["Stakeholder map", p.stakeholder_map_link],
  ] as const;
  const people = resources.filter((r) => r.status !== "Exited");

  return (
    <>
      <p className="small"><Link href="/projects">← Projects</Link></p>
      <div className="head">
        <div>
          <h1>{p.project_name}</h1>
          <p className="sub" style={{ margin: 0 }}>
            {p.project_id} · {p.client_name} · {p.project_type} · led by {lead?.name ?? (p.project_lead_email || "nobody yet")}
            {p.source_opportunity_id && (
              <>
                {" · from "}
                {canView(user.role, "opportunities") ? <Link href={`/pipeline/${p.source_opportunity_id}`}>{p.source_opportunity_id}</Link> : p.source_opportunity_id}
              </>
            )}
          </p>
        </div>
        <div className="actions">
          {editor && !p.is_draft && <Link className="btn primary" href={`/projects/${id}/update`}>Weekly update</Link>}
          {admin && <Link className="btn" href={`/projects/${id}/edit`}>{p.is_draft ? "Complete setup" : "Edit details"}</Link>}
        </div>
      </div>

      {q.saved && <div className="notice ok">Project saved.</div>}
      {q.updated && <div className="notice ok">Weekly update for the week of {q.updated} saved.</div>}
      {p.is_draft ? (
        <div className="notice">
          This is a draft created when the deal was marked Closed-Won. {admin ? "Complete its setup (lead, dates, status) to make it active." : "The admin still needs to complete its setup."}
        </div>
      ) : null}

      <div className="grid two">
        <div className="card">
          <h2>Delivery</h2>
          <dl className="kv">
            <dt>Status</dt>
            <dd><ProjectStatus status={p.status} draft={!!p.is_draft} /></dd>
            <dt>Progress</dt>
            <dd>
              {p.progress_pct}%<div className="progress" style={{ maxWidth: 240 }} aria-hidden><span style={{ width: `${p.progress_pct}%` }} /></div>
            </dd>
            <dt>Start</dt>
            <dd>{p.start_date || "–"}</dd>
            <dt>Planned end</dt>
            <dd>{p.planned_end_date || "–"}</dd>
            <dt>Forecast end</dt>
            <dd>
              {p.forecast_end_date || "–"} {slip > 0 && <span className="flag slip">+{slip} days late</span>}
            </dd>
            <dt>Last update</dt>
            <dd>
              {latest ? `Week of ${latest.week_start}` : "None yet"} {isStale(p, latest, s, now) && <span className="flag stale">Stale</span>}
            </dd>
          </dl>
        </div>
        <div className="grid" style={{ alignContent: "start" }}>
          {fin && (
            <div className="card">
              <h2>Financials ({ccy})</h2>
              <dl className="kv">
                <dt>Value</dt>
                <dd className="num" style={{ textAlign: "left" }}>{money(p.project_value)}</dd>
                <dt>Cost (budget)</dt>
                <dd>{money(p.project_cost)}</dd>
                <dt>Actual cost to date</dt>
                <dd>{money(p.actual_cost_to_date)}</dd>
                <dt>Margin</dt>
                <dd>{m === null ? "–" : `${m}%`}{p.margin_pct === null && m !== null && <span className="muted small"> calculated</span>}</dd>
              </dl>
              {p.currency !== ccy && <p className="small muted" style={{ marginBottom: 0 }}>Recorded in {p.currency}, converted at {s.usd_to_sar_rate} SAR per USD.</p>}
            </div>
          )}
          <div className="card">
            <h2>Documents</h2>
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {docs.map(([label, href]) => (
                <li key={label}>{href ? <a href={href} target="_blank" rel="noreferrer">{label}</a> : <span className="muted">{label}: not linked</span>}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div className="card section">
        <h2>Team: expected vs assigned (FTE{now >= (p.start_date || now) ? ", today" : ", at start"})</h2>
        {team.length === 0 ? (
          <p className="muted">No expected team or assignments yet.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Profile</th><th className="num">Expected</th><th className="num">Assigned</th><th className="num">Gap</th><th>People</th></tr>
              </thead>
              <tbody>
                {team.map((t) => (
                  <tr key={t.profile}>
                    <td>{t.profile}</td>
                    <td className="num">{t.expectedFte}</td>
                    <td className="num">{t.assignedFte}</td>
                    <td className="num">{t.gapFte > 0 ? <span className="flag slip">{t.gapFte} short</span> : t.gapFte < 0 ? `${-t.gapFte} over` : "–"}</td>
                    <td className="small">{t.people.join(", ") || <span className="muted">Nobody assigned</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <h2 style={{ marginTop: 20 }}>Assignments</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Person</th><th>Role</th><th className="num">Allocation</th><th>From</th><th>To</th>{editor && <th />}</tr>
            </thead>
            <tbody>
              {assignments.map((a) => {
                const r = byId.get(a.resource_id);
                return (
                  <tr key={a.id}>
                    <td>
                      <Link href={`/resources/${a.resource_id}`}>{r?.full_name ?? a.resource_id}</Link>{" "}
                      {r?.employment_type === "Trainee" && <span className="flag trainee">Trainee</span>}
                      <div className="small muted">{r?.profile}</div>
                    </td>
                    <td>{a.role_on_project}</td>
                    <td className="num">{a.allocation_pct}%</td>
                    <td>{a.assigned_from}</td>
                    <td>{a.assigned_to}</td>
                    {editor && (
                      <td>
                        <form action={deleteAssignmentAction}>
                          <input type="hidden" name="id" value={a.id} />
                          <button className="btn link danger" type="submit">Remove</button>
                        </form>
                      </td>
                    )}
                  </tr>
                );
              })}
              {assignments.length === 0 && <tr><td colSpan={6} className="muted">Nobody assigned yet.</td></tr>}
            </tbody>
          </table>
        </div>
        {editor && (
          <div className="section">
            <ActionForm action={addAssignmentAction} submit="Assign">
              <input type="hidden" name="project_id" value={id} />
              <label className="f">
                Person
                <select name="resource_id" required defaultValue="">
                  <option value="" disabled>Choose…</option>
                  {people.map((r) => <option key={r.resource_id} value={r.resource_id}>{r.full_name} · {r.profile}</option>)}
                </select>
              </label>
              <label className="f">Role<input name="role_on_project" required /></label>
              <label className="f" style={{ maxWidth: 110 }}>Allocation %<input name="allocation_pct" type="number" min={1} max={100} required /></label>
              <label className="f">From<input name="assigned_from" type="date" required defaultValue={p.start_date > now ? p.start_date : now} /></label>
              <label className="f">To<input name="assigned_to" type="date" required defaultValue={p.forecast_end_date || p.planned_end_date} /></label>
            </ActionForm>
          </div>
        )}

        <h2 style={{ marginTop: 20 }}>Expected team</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Profile</th><th className="num">Quantity</th><th className="num">Allocation</th><th>Needed from</th><th>Needed to</th>{editor && <th />}</tr>
            </thead>
            <tbody>
              {expected.map((e) => (
                <tr key={e.id}>
                  <td>{e.profile}</td>
                  <td className="num">{e.quantity}</td>
                  <td className="num">{e.allocation_pct}%</td>
                  <td>{e.needed_from}</td>
                  <td>{e.needed_to}</td>
                  {editor && (
                    <td>
                      <form action={deleteExpectedTeamAction}>
                        <input type="hidden" name="id" value={e.id} />
                        <button className="btn link danger" type="submit">Remove</button>
                      </form>
                    </td>
                  )}
                </tr>
              ))}
              {expected.length === 0 && <tr><td colSpan={6} className="muted">No expected team entered.</td></tr>}
            </tbody>
          </table>
        </div>
        {editor && (
          <div className="section">
            <ActionForm action={addExpectedTeamAction} submit="Add to expected team">
              <input type="hidden" name="project_id" value={id} />
              <label className="f">
                Profile
                <select name="profile" required defaultValue="">
                  <option value="" disabled>Choose…</option>
                  {listProfiles(db).map((pr) => <option key={pr.profile}>{pr.profile}</option>)}
                </select>
              </label>
              <label className="f" style={{ maxWidth: 100 }}>Quantity<input name="quantity" type="number" min={0.1} step={0.1} required defaultValue={1} /></label>
              <label className="f" style={{ maxWidth: 110 }}>Allocation %<input name="allocation_pct" type="number" min={1} max={100} required defaultValue={100} /></label>
              <label className="f">From<input name="needed_from" type="date" required defaultValue={p.start_date} /></label>
              <label className="f">To<input name="needed_to" type="date" required defaultValue={p.forecast_end_date || p.planned_end_date} /></label>
            </ActionForm>
          </div>
        )}
      </div>

      <div className="card section">
        <h2>Milestones</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Milestone</th><th>Planned</th><th>Actual</th></tr>
            </thead>
            <tbody>
              {milestones.map((ms) => {
                const late = !ms.actual_date && ms.planned_date < now;
                return (
                  <tr key={ms.id}>
                    <td>{ms.milestone}</td>
                    <td>{ms.planned_date} {late && <span className="flag overdue">Overdue</span>}</td>
                    <td>
                      {editor ? (
                        <ActionForm action={setMilestoneActualAction} submit="Save">
                          <input type="hidden" name="id" value={ms.id} />
                          <input type="hidden" name="project_id" value={id} />
                          <input name="actual_date" type="date" defaultValue={ms.actual_date} aria-label={`Actual date for ${ms.milestone}`} style={{ maxWidth: 170 }} />
                        </ActionForm>
                      ) : (
                        ms.actual_date || <span className="muted">Not yet</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {milestones.length === 0 && <tr><td colSpan={3} className="muted">No milestones (they are optional).</td></tr>}
            </tbody>
          </table>
        </div>
        {editor && (
          <div className="section">
            <ActionForm action={addMilestoneAction} submit="Add milestone">
              <input type="hidden" name="project_id" value={id} />
              <input type="hidden" name="actual_date" value="" />
              <label className="f">Milestone<input name="milestone" required /></label>
              <label className="f">Planned date<input name="planned_date" type="date" required /></label>
            </ActionForm>
          </div>
        )}
      </div>

      <div className="card section">
        <h2>Status history</h2>
        {updates.length === 0 ? (
          <p className="muted">No weekly updates yet.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Week of</th><th>Status</th><th className="num">Progress</th><th>Summary</th><th>Risks and issues</th><th>Next steps</th><th>By</th></tr>
              </thead>
              <tbody>
                {updates.map((u) => (
                  <tr key={u.week_start}>
                    <td style={{ whiteSpace: "nowrap" }}>{u.week_start}</td>
                    <td><ProjectStatus status={u.status} /></td>
                    <td className="num">{u.progress_pct}%</td>
                    <td>{u.summary}</td>
                    <td>{u.key_risks_issues || <span className="muted">–</span>}</td>
                    <td>{u.next_steps || <span className="muted">–</span>}</td>
                    <td className="small muted">{u.updated_by}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {history.length > 0 && (
        <div className="card section">
          <h2>Change history</h2>
          <ul className="small">
            {history.map((h) => (
              <li key={h.id}>
                {h.at.slice(0, 16).replace("T", " ")} · {h.actor_email} · {h.action === "create" ? "created" : `${h.field}: ${h.old_value || "–"} → ${h.new_value || "–"}`}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
