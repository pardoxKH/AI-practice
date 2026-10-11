import Link from "next/link";
import { redirect } from "next/navigation";
import { OpportunityForm } from "@/components/OpportunityForm";
import { getDb } from "@/lib/db";
import { canEdit } from "@/lib/permissions";
import { requireView } from "@/lib/session";
import { listResources } from "@/lib/store";

export default async function NewOpportunity() {
  const user = await requireView("opportunities");
  if (!canEdit(user.role, "opportunities")) redirect("/pipeline");
  const resources = listResources(getDb()).filter((r) => r.status !== "Exited").map((r) => ({ id: r.resource_id, name: r.full_name }));
  return (
    <>
      <p className="small"><Link href="/pipeline">← Pipeline</Link></p>
      <h1>New opportunity</h1>
      <p className="sub">The ID is assigned automatically.</p>
      <div className="card"><OpportunityForm resources={resources} /></div>
    </>
  );
}
