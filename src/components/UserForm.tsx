"use client";

import { useActionState } from "react";
import { saveUserAction } from "@/app/actions";
import { ROLES, type User } from "@/lib/domain";

/** One row form: adds a user, or changes the name or role of an existing one (matched on email). */
export function UserForm({ user }: { user?: User }) {
  const [state, action, pending] = useActionState(saveUserAction, undefined);
  return (
    <form action={action} className="filters" style={{ marginBottom: 0 }}>
      <label className="f">Email<input name="email" type="email" required defaultValue={user?.email} readOnly={!!user} /></label>
      <label className="f">Name<input name="name" required defaultValue={user?.name} /></label>
      <label className="f">
        Role
        <select name="role" defaultValue={user?.role ?? "Leadership"}>
          {ROLES.map((r) => <option key={r}>{r}</option>)}
        </select>
      </label>
      <div className="actions">
        <button className="btn primary" type="submit" disabled={pending}>{user ? "Save" : "Add user"}</button>
        {state?.error && <span className="small" style={{ color: "var(--critical-ink)" }}>{state.error}</span>}
        {state?.ok && <span className="small muted">{state.ok}</span>}
      </div>
    </form>
  );
}
