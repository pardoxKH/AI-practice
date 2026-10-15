import Link from "next/link";
import { redirect } from "next/navigation";
import { ResourceForm } from "@/components/ResourceForm";
import { getDb } from "@/lib/db";
import { canEdit } from "@/lib/permissions";
import { requireView } from "@/lib/session";
import { listProfiles } from "@/lib/store";

export default async function NewResource() {
  const user = await requireView("resources");
  if (!canEdit(user.role, "resources")) redirect("/resources");
  return (
    <>
      <p className="small"><Link href="/resources">← Resources</Link></p>
      <h1>Add person</h1>
      <p className="sub">The ID is assigned automatically.</p>
      <div className="card"><ResourceForm profiles={listProfiles(getDb()).map((p) => p.profile)} /></div>
    </>
  );
}
