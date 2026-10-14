import Link from "next/link";
import { redirect } from "next/navigation";
import { ProjectForm } from "@/components/ProjectForm";
import { getDb } from "@/lib/db";
import { canManageProjects } from "@/lib/permissions";
import { requireView } from "@/lib/session";
import { listUsers } from "@/lib/store";

export default async function NewProject() {
  const user = await requireView("projects");
  if (!canManageProjects(user)) redirect("/projects");
  const leads = listUsers(getDb()).filter((u) => u.role === "Project lead" || u.role === "Admin");
  return (
    <>
      <p className="small"><Link href="/projects">← Projects</Link></p>
      <h1>New project</h1>
      <p className="sub">For client work won outside the pipeline, POCs and internal accelerators. The ID is assigned automatically.</p>
      <div className="card"><ProjectForm leads={leads} /></div>
    </>
  );
}
