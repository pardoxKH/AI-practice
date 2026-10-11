import Link from "next/link";
import { notFound } from "next/navigation";
import { OpportunityForm } from "@/components/OpportunityForm";
import { today } from "@/lib/dates";
import { getDb } from "@/lib/db";
import { isOpen } from "@/lib/domain";
import { splitIds } from "@/lib/importer";
import { canEdit } from "@/lib/permissions";
import { formatMoneyFull, isAging, isOverdue, stageAgeDays, valueIn } from "@/lib/pipeline";
import { displayCurrency, requireView } from "@/lib/session";
import { getOpportunity, getSettings, listAudit, listResources, projectForOpportunity } from "@/lib/store";

export default async function OpportunityPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ handoff?: string; saved?: string }>;
}) {
  const user = await requireView("opportunities");
  const { id } = await params;
  const { handoff, saved } = await searchParams;
  const db = getDb();
  const o = getOpportunity(db, id);
  if (!o) notFound();
  const ccy = await displayCurrency();
  const s = getSettings(db);
  const now = today();
  const resources = listResources(db);
  const byId = new Map(resources.map((r) => [r.resource_id, r.full_name]));
  const project = projectForOpportunity(db, id);
  const history = listAudit(db, { entity: "opportunities", entityId: id, limit: 50 });
  const editable = canEdit(user.role, "opportunities");

  return (
    <>
      <p className="small"><Link href="/pipeline">← Pipeline</Link></p>
      <div className="head">
        <div>
          <h1>{o.opportunity_name}</h1>
          <p className="sub" style={{ margin: 0 }}>
            {o.opportunity_id} · {o.client_name} · {o.stage}
          </p>
        </div>
        <div className="actions">
          {isOverdue(o, now) && <span className="flag overdue">Past expected close</span>}
          {isAging(o, now, s) && <span className="flag aging">Aging in stage</span>}
        </div>
      </div>

      {handoff && <div className="notice ok">Closed-Won: draft project {handoff} was created and linked to this deal. Complete it when Projects ship in Phase 2.</div>}
      {saved && !handoff && <div className="notice ok">Saved.</div>}

      <div className="grid two">
        <div className="card">
          <h2>Details</h2>
          <dl className="kv">
            <dt>Value</dt>
            <dd>
              {formatMoneyFull(o.opportunity_value, o.currency)}
              {o.currency !== ccy && <span className="muted"> ≈ {formatMoneyFull(valueIn(o, ccy, s), ccy)}</span>}
            </dd>
            <dt>Partner</dt><dd>{o.partner}</dd>
            <dt>BD manager</dt><dd>{o.bd_manager}</dd>
            <dt>Initiated</dt><dd>{o.initiation_date}</dd>
            <dt>In stage since</dt><dd>{o.stage_entered_date}{isOpen(o.stage) && <span className="muted"> ({stageAgeDays(o, now)} days)</span>}</dd>
            <dt>Expected close</dt><dd>{o.expected_close_date}</dd>
            <dt>Presales team</dt>
            <dd>{splitIds(o.presales_resource_ids).map((r) => byId.get(r) ?? r).join(", ") || <span className="muted">None</span>}</dd>
            <dt>Notes</dt><dd>{o.notes || <span className="muted">None</span>}</dd>
            <dt>Project</dt>
            <dd>
              {project ? `${project.project_id} · ${project.project_name}${project.is_draft ? " (draft)" : ` (${project.status})`}` : <span className="muted">None yet</span>}
            </dd>
          </dl>
        </div>
        <div className="card">
          <h2>History</h2>
          {history.length === 0 ? (
            <p className="muted">No changes since the initial load.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <tbody>
                  {history.map((h) => (
                    <tr key={h.id}>
                      <td className="small muted" style={{ whiteSpace: "nowrap" }}>{h.at.slice(0, 16).replace("T", " ")}</td>
                      <td className="small">
                        {h.action === "create" ? "Created" : <><b>{h.field}</b>: {h.old_value || "–"} → {h.new_value || "–"}</>}
                        <div className="muted">{h.actor_email}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {editable && (
        <div className="card section">
          <h2>Edit</h2>
          <OpportunityForm opp={o} resources={resources.filter((r) => r.status !== "Exited").map((r) => ({ id: r.resource_id, name: r.full_name }))} />
        </div>
      )}
    </>
  );
}
