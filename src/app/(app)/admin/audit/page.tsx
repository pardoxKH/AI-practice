import Link from "next/link";
import { getDb } from "@/lib/db";
import { requireView } from "@/lib/session";
import { listAudit } from "@/lib/store";

const ENTITIES = ["opportunities", "resources", "users", "settings", "projects", "profiles"];

export default async function Audit({ searchParams }: { searchParams: Promise<{ entity?: string }> }) {
  await requireView("audit");
  const { entity } = await searchParams;
  const rows = listAudit(getDb(), { entity: entity || undefined, limit: 300 });
  const link = (e: string, id: string) =>
    e === "opportunities" ? <Link href={`/pipeline/${id}`}>{id}</Link> : e === "resources" && id !== "*" ? <Link href={`/resources/${id}`}>{id}</Link> : id;
  return (
    <>
      <h1>Audit trail</h1>
      <p className="sub">Who changed what, and when. Latest 300 entries.</p>
      <form className="filters card" method="get">
        <label className="f">
          Area
          <select name="entity" defaultValue={entity ?? ""}>
            <option value="">All</option>
            {ENTITIES.map((e) => <option key={e}>{e}</option>)}
          </select>
        </label>
        <div className="actions"><button className="btn" type="submit">Apply</button></div>
      </form>
      <div className="card table-wrap">
        <table>
          <thead><tr><th>When (UTC)</th><th>Who</th><th>Area</th><th>Record</th><th>Change</th></tr></thead>
          <tbody>
            {rows.map((h) => (
              <tr key={h.id}>
                <td className="small" style={{ whiteSpace: "nowrap" }}>{h.at.slice(0, 19).replace("T", " ")}</td>
                <td className="small">{h.actor_email}</td>
                <td>{h.entity}</td>
                <td>{link(h.entity, h.entity_id)}</td>
                <td className="small">
                  {h.action === "update" ? <><b>{h.field}</b>: {h.old_value || "–"} → {h.new_value || "–"}</> : `${h.action}${h.new_value ? `: ${h.new_value}` : ""}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
