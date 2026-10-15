import Link from "next/link";
import { notFound } from "next/navigation";
import { addAssignmentAction, deleteAssignmentAction } from "@/app/actions";
import { ActionForm } from "@/components/ActionForm";
import { HeatCell, HeatLegend } from "@/components/HeatCell";
import { today } from "@/lib/dates";
import { getDb } from "@/lib/db";
import { isActiveProject, isOpen } from "@/lib/domain";
import { allocationInWeek, defaultPeriodType, engagementOf, periodsOf, utilizationGrid, weeksFrom } from "@/lib/people";
import { canEdit, canManageProjects, canView } from "@/lib/permissions";
import { requireView } from "@/lib/session";
import { getResource, getSettings, listAssignments, listOpportunities, listProjects, listUtilization } from "@/lib/store";

export default async function ResourceView({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireView("resources");
  const { id } = await params;
  const db = getDb();
  const r = getResource(db, id);
  if (!r) notFound();
  const s = getSettings(db);
  const now = today();
  const projects = listProjects(db);
  const opps = listOpportunities(db);
  const pMap = new Map(projects.map((p) => [p.project_id, p]));
  const oMap = new Map(opps.map((o) => [o.opportunity_id, o]));
  const assignments = listAssignments(db, { resourceId: id });
  const current = assignments.filter((a) => a.assigned_to >= now);
  const past = assignments.filter((a) => a.assigned_to < now);
  const weeks = weeksFrom(now, 12);
  const plan = weeks.map((w) => allocationInWeek(assignments, id, w));
  const util = listUtilization(db);
  const type = defaultPeriodType(util);
  const periods = periodsOf(util, type).slice(-12);
  const mine = utilizationGrid(util, type).get(r.email.toLowerCase());
  const seeProjects = canView(user.role, "projects");
  const seePipeline = canView(user.role, "opportunities");
  const admin = canManageProjects(user);

  const target = (a: (typeof assignments)[number]) => {
    const { engagement, client } = engagementOf(a, pMap, oMap);
    const name = a.project_id ? pMap.get(a.project_id)?.project_name ?? a.project_id : oMap.get(a.opportunity_id)?.opportunity_name ?? a.opportunity_id;
    const href = a.project_id ? (seeProjects ? `/projects/${a.project_id}` : null) : seePipeline ? `/pipeline/${a.opportunity_id}` : null;
    return { engagement, client, name, href };
  };

  const rows = (list: typeof assignments, removable: boolean) =>
    list.map((a) => {
      const t = target(a);
      return (
        <tr key={a.id}>
          <td>
            {t.href ? <Link href={t.href}>{t.name}</Link> : t.name}
            <div className="small muted">{t.client}</div>
          </td>
          <td>{t.engagement}</td>
          <td>{a.role_on_project}</td>
          <td className="num">{a.allocation_pct}%</td>
          <td>{a.assigned_from}</td>
          <td>{a.assigned_to}</td>
          {removable && (
            <td>
              <form action={deleteAssignmentAction}>
                <input type="hidden" name="id" value={a.id} />
                <button className="btn link danger" type="submit">Remove</button>
              </form>
            </td>
          )}
        </tr>
      );
    });

  return (
    <>
      <p className="small"><Link href="/resources">← Resources</Link></p>
      <div className="head">
        <div>
          <h1>{r.full_name}</h1>
          <p className="sub" style={{ margin: 0 }}>
            {r.resource_id} · {r.profile}{r.seniority && ` · ${r.seniority}`} · {r.employment_type === "Trainee" ? <span className="flag trainee">Trainee</span> : "FTE"} · {r.status}
          </p>
        </div>
        {canEdit(user.role, "resources") && <Link className="btn" href={`/resources/${id}/edit`}>Edit details</Link>}
      </div>

      <div className="grid two">
        <div className="card">
          <h2>Details</h2>
          <dl className="kv">
            <dt>Email</dt><dd>{r.email}</dd>
            <dt>Line manager</dt><dd>{r.line_manager || "–"}</dd>
            <dt>Joined</dt><dd>{r.join_date || "–"}</dd>
            <dt>Skills</dt><dd>{r.skills ? r.skills.split(";").map((x) => x.trim()).filter(Boolean).join(", ") : "–"}</dd>
          </dl>
        </div>
        <div className="card">
          <h2>Utilization, ops report (last {periods.length} {type === "Week" ? "weeks" : "months"})</h2>
          {periods.length === 0 ? (
            <p className="muted">No utilization report loaded yet.</p>
          ) : (
            <div className="table-wrap">
              <table className="heat">
                <thead><tr>{periods.map((p) => <th key={p} className="p">{p.slice(5)}</th>)}</tr></thead>
                <tbody>
                  <tr>{periods.map((p) => <HeatCell key={p} pct={mine?.get(p)} title={`${type} of ${p}`} under={(mine?.get(p) ?? 100) < s.underutilized_below_pct} />)}</tr>
                </tbody>
              </table>
              <HeatLegend underLabel={`Below ${s.underutilized_below_pct}%`} />
            </div>
          )}
          <h2 style={{ marginTop: 16 }}>Planned allocation, next 12 weeks</h2>
          <div className="table-wrap">
            <table className="heat">
              <thead><tr>{weeks.map((w) => <th key={w} className="p">{w.slice(5)}</th>)}</tr></thead>
              <tbody>
                <tr>{plan.map((pct, i) => <HeatCell key={weeks[i]} pct={pct} title={`Week of ${weeks[i]} planned`} under={pct > 100} max={100} />)}</tr>
              </tbody>
            </table>
          </div>
          <p className="small muted" style={{ marginBottom: 0 }}>From assignments. A red outline here means planned above 100%.</p>
        </div>
      </div>

      <div className="card section">
        <h2>Current and upcoming assignments</h2>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Assigned to</th><th>Engagement</th><th>Role</th><th className="num">Allocation</th><th>From</th><th>To</th>{admin && <th />}</tr></thead>
            <tbody>
              {rows(current, admin)}
              {current.length === 0 && <tr><td colSpan={7} className="muted">Nothing planned, so this person is on the bench.</td></tr>}
            </tbody>
          </table>
        </div>
        {admin && (
          <div className="section">
            <p className="small muted" style={{ margin: "0 0 6px" }}>Assign to a project, or to an opportunity for presales time (fill in one of the two).</p>
            <ActionForm action={addAssignmentAction} submit="Assign">
              <input type="hidden" name="resource_id" value={id} />
              <label className="f">
                Project
                <select name="project_id" defaultValue="">
                  <option value="">–</option>
                  {projects.filter((p) => isActiveProject(p) || p.is_draft).map((p) => <option key={p.project_id} value={p.project_id}>{p.project_id} · {p.project_name}</option>)}
                </select>
              </label>
              <label className="f">
                or opportunity
                <select name="opportunity_id" defaultValue="">
                  <option value="">–</option>
                  {opps.filter((o) => isOpen(o.stage)).map((o) => <option key={o.opportunity_id} value={o.opportunity_id}>{o.opportunity_id} · {o.opportunity_name}</option>)}
                </select>
              </label>
              <label className="f">Role<input name="role_on_project" required defaultValue={r.profile} /></label>
              <label className="f" style={{ maxWidth: 110 }}>Allocation %<input name="allocation_pct" type="number" min={1} max={100} required /></label>
              <label className="f">From<input name="assigned_from" type="date" required defaultValue={now} /></label>
              <label className="f">To<input name="assigned_to" type="date" required /></label>
            </ActionForm>
          </div>
        )}
        {past.length > 0 && (
          <details className="section">
            <summary className="small">Past assignments ({past.length})</summary>
            <div className="table-wrap">
              <table>
                <tbody>{rows(past, false)}</tbody>
              </table>
            </div>
          </details>
        )}
      </div>
    </>
  );
}
