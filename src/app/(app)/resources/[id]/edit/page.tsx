import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ResourceForm } from "@/components/ResourceForm";
import { getDb } from "@/lib/db";
import { canEdit } from "@/lib/permissions";
import { requireView } from "@/lib/session";
import { getResource, listAudit, listProfiles } from "@/lib/store";

export default async function EditResource({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireView("resources");
  if (!canEdit(user.role, "resources")) redirect(`/resources/${(await params).id}`);
  const { id } = await params;
  const db = getDb();
  const resource = getResource(db, id);
  if (!resource) notFound();
  const history = listAudit(db, { entity: "resources", entityId: id, limit: 20 });
  return (
    <>
      <p className="small"><Link href={`/resources/${id}`}>← {resource.full_name}</Link></p>
      <h1>Edit {resource.full_name}</h1>
      <p className="sub">{resource.resource_id}</p>
      <div className="card"><ResourceForm resource={resource} profiles={listProfiles(db).map((p) => p.profile)} /></div>
      {history.length > 0 && (
        <div className="card section">
          <h2>History</h2>
          <ul className="small">
            {history.map((h) => (
              <li key={h.id}>{h.at.slice(0, 16).replace("T", " ")} · {h.actor_email} · {h.action === "create" ? "created" : `${h.field}: ${h.old_value || "–"} → ${h.new_value || "–"}`}</li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
