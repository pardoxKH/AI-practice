import Link from "next/link";
import { getDb } from "@/lib/db";
import { canEdit } from "@/lib/permissions";
import { requireView } from "@/lib/session";
import { listProfiles, listResources } from "@/lib/store";

type F = { type?: string; status?: string; profile?: string; saved?: string };

export default async function Resources({ searchParams }: { searchParams: Promise<F> }) {
  const user = await requireView("resources");
  const f = await searchParams;
  const db = getDb();
  const all = listResources(db);
  const status = f.status ?? "current";
  const rows = all.filter(
    (r) =>
      (!f.type || r.employment_type === f.type) &&
      (!f.profile || r.profile === f.profile) &&
      (status === "all" || (status === "current" ? r.status !== "Exited" : r.status === status)),
  );
  const editable = canEdit(user.role, "resources");
  const current = all.filter((r) => r.status !== "Exited");
  const profileCounts = listProfiles(db).map((p) => ({ ...p, n: current.filter((r) => r.profile === p.profile).length }));

  return (
    <>
      <div className="head">
        <div>
          <h1>Resource master list</h1>
          <p className="sub" style={{ margin: 0 }}>
            {current.filter((r) => r.employment_type === "FTE").length} FTEs and {current.filter((r) => r.employment_type === "Trainee").length} trainees.
            Allocation and utilization arrive in Phase 2.
          </p>
        </div>
        {editable && <Link className="btn primary" href="/resources/new">Add person</Link>}
      </div>
      {f.saved && <div className="notice ok">Saved {f.saved}.</div>}

      <form className="filters card" method="get">
        <label className="f">
          Type
          <select name="type" defaultValue={f.type ?? ""}>
            <option value="">All</option><option>FTE</option><option>Trainee</option>
          </select>
        </label>
        <label className="f">
          Profile
          <select name="profile" defaultValue={f.profile ?? ""}>
            <option value="">All</option>
            {profileCounts.map((p) => <option key={p.profile} value={p.profile}>{p.profile} ({p.n})</option>)}
          </select>
        </label>
        <label className="f">
          Status
          <select name="status" defaultValue={status}>
            <option value="current">Active and on leave</option>
            <option>Active</option><option>On leave</option><option>Exited</option>
            <option value="all">All</option>
          </select>
        </label>
        <div className="actions"><button className="btn" type="submit">Apply</button><Link href="/resources" className="small">Clear</Link></div>
      </form>

      <div className="card table-wrap">
        <table>
          <thead>
            <tr><th>ID</th><th>Name</th><th>Profile</th><th>Seniority</th><th>Type</th><th>Status</th><th>Line manager</th><th>Skills</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.resource_id}>
                <td className="muted">{r.resource_id}</td>
                <td>
                  {editable ? <Link href={`/resources/${r.resource_id}`}>{r.full_name}</Link> : r.full_name}
                  <div className="small muted">{r.email}</div>
                </td>
                <td>{r.profile}</td>
                <td>{r.seniority}</td>
                <td>{r.employment_type === "Trainee" ? <span className="badge">Trainee</span> : "FTE"}</td>
                <td>{r.status}</td>
                <td>{r.line_manager}</td>
                <td className="small">{r.skills}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={8} className="muted">Nobody matches these filters.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
