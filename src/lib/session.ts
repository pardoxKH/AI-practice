import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { resolveUser } from "./access";
import { getDb } from "./db";
import { CURRENCIES, type Currency, type User } from "./domain";
import { type Area, canEdit, canView } from "./permissions";
import { getSettings } from "./store";

/**
 * The signed-in user, with their role read fresh from the users tab on every request,
 * so role changes and removals apply immediately.
 */
export async function requireUser(): Promise<User> {
  const session = await auth();
  if (!session?.user?.email) redirect("/signin");
  const user = resolveUser(getDb(), session.user.email);
  if (!user) redirect("/signin?error=AccessDenied");
  return user;
}

export async function requireView(area: Area): Promise<User> {
  const user = await requireUser();
  if (!canView(user.role, area)) redirect("/?denied=" + area);
  return user;
}

export async function requireEdit(area: Area): Promise<User> {
  const user = await requireUser();
  if (!canEdit(user.role, area)) throw new Error(`Your role (${user.role}) can't edit ${area}`);
  return user;
}

export async function displayCurrency(): Promise<Currency> {
  const c = (await cookies()).get("ccy")?.value;
  return (CURRENCIES as readonly string[]).includes(c ?? "") ? (c as Currency) : getSettings(getDb()).reporting_currency;
}
