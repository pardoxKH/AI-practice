import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { StatusUpdateForm } from "@/components/StatusUpdateForm";
import { today } from "@/lib/dates";
import { getDb } from "@/lib/db";
import { canEditProject } from "@/lib/permissions";
import { weekStart } from "@/lib/pipeline";
import { requireView } from "@/lib/session";
import { getProject, listStatusUpdates } from "@/lib/store";

export default async function WeeklyUpdate({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireView("projects");
  const { id } = await params;
  const db = getDb();
  const p = getProject(db, id);
  if (!p) notFound();
  if (!canEditProject(user, p)) redirect(`/projects/${id}`);
  const week = weekStart(today());
  const existing = listStatusUpdates(db, id).find((u) => u.week_start === week);
  return (
    <>
      <p className="small"><Link href={`/projects/${id}`}>← {p.project_name}</Link></p>
      <h1>Weekly update</h1>
      <p className="sub">
        {p.project_name} · {p.client_name}. The status and progress you enter here become the project&apos;s current status.
        {existing && " This week already has an update; saving replaces it."}
      </p>
      <div className="card"><StatusUpdateForm project={p} week={week} existing={existing} /></div>
    </>
  );
}
