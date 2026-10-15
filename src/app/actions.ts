"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { signIn, signOut } from "@/auth";
import { today } from "@/lib/dates";
import { getDb } from "@/lib/db";
import { CURRENCIES, ROLES } from "@/lib/domain";
import { optDate, schemas, splitIds } from "@/lib/importer";
import { requireEdit } from "@/lib/session";
import { createOpportunity, deleteUser, saveResource, saveSettings, saveUser, updateOpportunity } from "@/lib/store";

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
