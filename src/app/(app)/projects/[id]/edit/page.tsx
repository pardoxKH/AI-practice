import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ProjectForm } from "@/components/ProjectForm";
import { getDb } from "@/lib/db";
import { canManageProjects } from "@/lib/permissions";
import { requireView } from "@/lib/session";
import { getProject, listUsers } from "@/lib/store";

export default async function EditProject({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireView("projects");
  const { id } = await params;
  if (!canManageProjects(user)) redirect(`/projects/${id}`);
  const db = getDb();
  const project = getProject(db, id);
  if (!project) notFound();
  return (
    <>
      <p className="small"><Link href={`/projects/${id}`}>← {project.project_name}</Link></p>
      <h1>{project.is_draft ? "Complete project setup" : "Edit project"}</h1>
      <p className="sub">{project.project_id}{project.source_opportunity_id && ` · from opportunity ${project.source_opportunity_id}`}</p>
      <div className="card"><ProjectForm project={project} leads={listUsers(db).filter((u) => u.role === "Project lead" || u.role === "Admin")} /></div>
    </>
  );
}
