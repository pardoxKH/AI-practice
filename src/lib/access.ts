// Who may sign in, and with which role. The users tab is the source of truth; BOOTSTRAP_ADMIN_EMAILS
// lets the owner get in as Admin before their own address is in that tab.
import type { DB } from "./db";
import type { User } from "./domain";
import { getUser } from "./store";

export const bootstrapAdmins = () =>
  (process.env.BOOTSTRAP_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

export function resolveUser(db: DB, email: string | null | undefined): User | undefined {
  if (!email) return undefined;
  const found = getUser(db, email);
  if (found) return found;
  const e = email.trim().toLowerCase();
  if (bootstrapAdmins().includes(e)) return { email: e, name: e, role: "Admin" };
  return undefined;
}

/** Optional Google Workspace domain lock, e.g. GOOGLE_WORKSPACE_DOMAIN=firm.com. */
export function domainAllowed(email: string): boolean {
  const domain = process.env.GOOGLE_WORKSPACE_DOMAIN?.trim().toLowerCase();
  return !domain || email.toLowerCase().endsWith(`@${domain}`) || bootstrapAdmins().includes(email.toLowerCase());
}

export const devLoginEnabled = () => process.env.AUTH_DEV_LOGIN === "true";
