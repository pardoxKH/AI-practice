"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { signIn, signOut } from "@/auth";
import { today } from "@/lib/dates";
import { getDb } from "@/lib/db";
import { CURRENCIES, PROJECT_STATUSES, ROLES, type User } from "@/lib/domain";
import { optDate, parseCsv, schemas, splitIds, validateTab } from "@/lib/importer";
import { canEditProject, canManageProjects } from "@/lib/permissions";
import { weekStart } from "@/lib/pipeline";
import { requireEdit, requireUser } from "@/lib/session";
import {
  addAssignment,
  addExpectedTeam,
  addMilestone,
  createOpportunity,
  deleteAssignment,
  deleteExpectedTeam,
  deleteUser,
  getAssignment,
  getExpectedTeamRow,
  getOpportunity,
  getProject,
  getResource,
  importUtilization,
  saveProject,
  saveResource,
  saveSettings,
  saveStatusUpdate,
  saveUser,
  setMilestoneActual,
  updateOpportunity,
} from "@/lib/store";
import { readSheet } from "@/lib/xlsx";

export type FormState = { error?: string; ok?: string } | undefined;

const formObject = (fd: FormData) => Object.fromEntries([...fd.entries()].filter(([, v]) => typeof v === "string")) as Record<string, string>;
const firstError = (e: z.ZodError) => e.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ");

export async function setCurrency(fd: FormData) {
  const ccy = String(fd.get("ccy"));
  if ((CURRENCIES as readonly string[]).includes(ccy)) (await cookies()).set("ccy", ccy, { path: "/", maxAge: 60 * 60 * 24 * 365 });
  revalidatePath("/", "layout");
}

export async function googleSignIn() {
  await signIn("google", { redirectTo: "/" });
}

export async function devSignIn(fd: FormData) {
  await signIn("dev", { email: String(fd.get("email")), redirectTo: "/" });
}

export async function doSignOut() {
  await signOut({ redirectTo: "/signin" });
}

const opportunityForm = schemas.opportunities
  .omit({ opportunity_id: true, stage_entered_date: true })
  .extend({ stage_entered_date: optDate });

export async function saveOpportunityAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireEdit("opportunities");
  const raw = formObject(fd);
  const parsed = opportunityForm.safeParse(raw);
  if (!parsed.success) return { error: firstError(parsed.error) };
  const input = { ...parsed.data, presales_resource_ids: splitIds(parsed.data.presales_resource_ids).join("; ") };
  if (input.expected_close_date < input.initiation_date) return { error: "Expected close date can't be before the initiation date" };
  const db = getDb();
  const id = raw.opportunity_id;
  const result = id
    ? updateOpportunity(db, user.email, id, input, today())
    : createOpportunity(db, user.email, input, today());
  revalidatePath("/", "layout");
  redirect(`/pipeline/${result.id}${result.draftProjectId ? `?handoff=${result.draftProjectId}` : "?saved=1"}`);
}

const resourceForm = schemas.resources.omit({ resource_id: true });

export async function saveResourceAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireEdit("resources");
  const raw = formObject(fd);
  const parsed = resourceForm.safeParse(raw);
  if (!parsed.success) return { error: firstError(parsed.error) };
  const id = saveResource(getDb(), user.email, { ...parsed.data, resource_id: raw.resource_id || undefined });
  revalidatePath("/", "layout");
  redirect(`/resources?saved=${id}`);
}

const userForm = z.object({ email: z.string().trim().toLowerCase().email("must be an email"), name: z.string().trim().min(1, "is required"), role: z.enum(ROLES) });

export async function saveUserAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireEdit("users");
  const parsed = userForm.safeParse(formObject(fd));
  if (!parsed.success) return { error: firstError(parsed.error) };
  if (parsed.data.email === user.email && parsed.data.role !== "Admin") return { error: "You can't remove your own Admin role" };
  saveUser(getDb(), user.email, parsed.data);
  revalidatePath("/admin/users");
  return { ok: `Saved ${parsed.data.email}` };
}

export async function deleteUserAction(fd: FormData) {
  const user = await requireEdit("users");
  const email = String(fd.get("email")).toLowerCase();
  if (email === user.email) return;
  deleteUser(getDb(), user.email, email);
  revalidatePath("/admin/users");
}

const settingsForm = z.object({
  reporting_currency: z.enum(CURRENCIES),
  usd_to_sar_rate: z.coerce.number().positive("must be above 0"),
  utilization_target_pct: z.coerce.number().min(0).max(100),
  underutilized_below_pct: z.coerce.number().min(0).max(100),
  stale_update_days: z.coerce.number().int().min(1),
  stage_aging_alert_days: z.coerce.number().int().min(1),
});

export async function saveSettingsAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireEdit("settings");
  const parsed = settingsForm.safeParse(formObject(fd));
  if (!parsed.success) return { error: firstError(parsed.error) };
  saveSettings(getDb(), user.email, parsed.data);
  revalidatePath("/", "layout");
  return { ok: "Settings saved" };
}

// ---------- projects (Phase 2) ----------

/** The signed-in user, if they may edit this project's delivery data (Admin, or its lead). */
async function requireProjectEditor(projectId: string): Promise<User> {
  const user = await requireUser();
  const project = getProject(getDb(), projectId);
  if (!project) throw new Error(`Project ${projectId} not found`);
  if (!canEditProject(user, project)) throw new Error(`Only the admin or this project's lead can change ${projectId}`);
  return user;
}

const projectForm = schemas.projects.omit({ project_id: true });

export async function saveProjectAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  if (!canManageProjects(user)) return { error: "Only the admin edits project details and financials" };
  const raw = formObject(fd);
  const parsed = projectForm.safeParse(raw);
  if (!parsed.success) return { error: firstError(parsed.error) };
  const p = parsed.data;
  if (p.planned_end_date < p.start_date) return { error: "Planned end date can't be before the start date" };
  if (p.forecast_end_date && p.forecast_end_date < p.start_date) return { error: "Forecast end date can't be before the start date" };
  const id = saveProject(getDb(), user.email, { ...p, project_id: raw.project_id || undefined });
  revalidatePath("/", "layout");
  redirect(`/projects/${id}?saved=1`);
}

const updateForm = z
  .object({
    project_id: z.string().min(1),
    week_start: optDate,
    status: z.enum(PROJECT_STATUSES),
    progress_pct: z.coerce.number().min(0, "must be 0-100").max(100, "must be 0-100"),
    summary: z.string().trim().min(1, "is required"),
    key_risks_issues: z.string().trim().default(""),
    next_steps: z.string().trim().default(""),
    forecast_end_date: optDate,
  })
  .refine((u) => !(u.status === "At risk" || u.status === "Off track") || u.key_risks_issues, {
    message: "are required when the status is At risk or Off track",
    path: ["key risks and issues"],
  });

export async function saveStatusUpdateAction(_: FormState, fd: FormData): Promise<FormState> {
  const parsed = updateForm.safeParse(formObject(fd));
  if (!parsed.success) return { error: firstError(parsed.error) };
  const { forecast_end_date, ...u } = parsed.data;
  const user = await requireProjectEditor(u.project_id);
  const week = weekStart(u.week_start || today());
  saveStatusUpdate(getDb(), user.email, { ...u, week_start: week, updated_by: user.email }, forecast_end_date);
  revalidatePath("/", "layout");
  redirect(`/projects/${u.project_id}?updated=${week}`);
}

export async function addAssignmentAction(_: FormState, fd: FormData): Promise<FormState> {
  const raw = formObject(fd);
  const parsed = schemas.project_assignments.safeParse({ project_id: "", opportunity_id: "", ...raw });
  if (!parsed.success) return { error: firstError(parsed.error) };
  const a = parsed.data;
  const db = getDb();
  let user: User;
  if (a.project_id) {
    user = await requireProjectEditor(a.project_id);
  } else {
    user = await requireUser();
    if (!canManageProjects(user)) return { error: "Only the admin assigns people to opportunities" };
    if (!getOpportunity(db, a.opportunity_id)) return { error: `Opportunity ${a.opportunity_id} not found` };
  }
  if (!getResource(db, a.resource_id)) return { error: `Resource ${a.resource_id} not found` };
  addAssignment(db, user.email, a);
  revalidatePath("/", "layout");
  return { ok: "Assignment added" };
}

export async function deleteAssignmentAction(fd: FormData) {
  const db = getDb();
  const a = getAssignment(db, Number(fd.get("id")));
  if (!a) return;
  const user = a.project_id ? await requireProjectEditor(a.project_id) : await requireUser();
  if (!a.project_id && !canManageProjects(user)) throw new Error("Only the admin changes presales assignments");
  deleteAssignment(db, user.email, a.id);
  revalidatePath("/", "layout");
}

export async function addExpectedTeamAction(_: FormState, fd: FormData): Promise<FormState> {
  const parsed = schemas.project_expected_team.safeParse(formObject(fd));
  if (!parsed.success) return { error: firstError(parsed.error) };
  const user = await requireProjectEditor(parsed.data.project_id);
  addExpectedTeam(getDb(), user.email, parsed.data);
  revalidatePath("/", "layout");
  return { ok: "Added to the expected team" };
}

export async function deleteExpectedTeamAction(fd: FormData) {
  const db = getDb();
  const row = getExpectedTeamRow(db, Number(fd.get("id")));
  if (!row) return;
  const user = await requireProjectEditor(row.project_id);
  deleteExpectedTeam(db, user.email, row.id);
  revalidatePath("/", "layout");
}

export async function addMilestoneAction(_: FormState, fd: FormData): Promise<FormState> {
  const parsed = schemas.project_milestones.safeParse(formObject(fd));
  if (!parsed.success) return { error: firstError(parsed.error) };
  const user = await requireProjectEditor(parsed.data.project_id);
  addMilestone(getDb(), user.email, parsed.data);
  revalidatePath("/", "layout");
  return { ok: "Milestone added" };
}

export async function setMilestoneActualAction(_: FormState, fd: FormData): Promise<FormState> {
  const projectId = String(fd.get("project_id"));
  const actual = optDate.safeParse(String(fd.get("actual_date") ?? ""));
  if (!actual.success) return { error: firstError(actual.error) };
  const user = await requireProjectEditor(projectId);
  setMilestoneActual(getDb(), user.email, Number(fd.get("id")), actual.data);
  revalidatePath("/", "layout");
  return { ok: "Saved" };
}

// ---------- utilization import ----------

export type ImportState = { error?: string; ok?: string; details?: string[] } | undefined;

export async function importUtilizationAction(_: ImportState, fd: FormData): Promise<ImportState> {
  const user = await requireEdit("utilization");
  const file = fd.get("file");
  if (!(file instanceof File) || !file.size) return { error: "Choose the ops report (.csv or .xlsx)" };
  const name = file.name.toLowerCase();
  let raw: Record<string, string>[];
  try {
    raw = name.endsWith(".xlsx") ? await readSheet(await file.arrayBuffer(), "utilization") : parseCsv(await file.text());
  } catch (e) {
    return { error: `Couldn't read ${file.name}: ${(e as Error).message}` };
  }
  const errors: string[] = [];
  const rows = validateTab("utilization", raw, errors);
  if (errors.length) return { error: `${file.name} has ${errors.length} problem(s); nothing was loaded.`, details: errors.slice(0, 20) };
  if (!rows.length) return { error: `${file.name} has no utilization rows` };
  const r = importUtilization(getDb(), user.email, rows, file.name);
  revalidatePath("/", "layout");
  return {
    ok: `Loaded ${r.rows} rows for ${r.periods.length} period(s)${r.replaced ? `, replacing ${r.replaced} earlier rows for the same periods` : ""}.`,
    details: r.unknownEmails.length ? [`Not in the resource master list (kept, but not shown until the person is added): ${r.unknownEmails.join(", ")}`] : undefined,
  };
}
