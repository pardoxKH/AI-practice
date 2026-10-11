"use client";

import { useActionState } from "react";
import { saveResourceAction } from "@/app/actions";
import { EMPLOYMENT_TYPES, RESOURCE_STATUSES, type Resource } from "@/lib/domain";

export function ResourceForm({ resource, profiles }: { resource?: Resource; profiles: string[] }) {
  const [state, action, pending] = useActionState(saveResourceAction, undefined);
  const v = (k: keyof Resource) => (resource ? String(resource[k] ?? "") : "");
  return (
    <form action={action} className="stack">
      {resource && <input type="hidden" name="resource_id" value={resource.resource_id} />}
      {state?.error && <div className="notice err">{state.error}</div>}
      <div className="fields">
        <label className="f">Full name<input name="full_name" required defaultValue={v("full_name")} /></label>
        <label className="f">Email<input name="email" type="email" required defaultValue={v("email")} /></label>
        <label className="f">
          Employment type
          <select name="employment_type" defaultValue={v("employment_type") || "FTE"}>
            {EMPLOYMENT_TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </label>
        <label className="f">
          Profile
          <select name="profile" defaultValue={v("profile") || profiles[0]}>
            {profiles.map((p) => <option key={p}>{p}</option>)}
          </select>
        </label>
        <label className="f">Seniority<input name="seniority" list="seniority" defaultValue={v("seniority")} /></label>
        <datalist id="seniority">{["Junior", "Mid", "Senior", "Lead"].map((s) => <option key={s} value={s} />)}</datalist>
        <label className="f">Line manager<input name="line_manager" defaultValue={v("line_manager")} /></label>
        <label className="f">Join date<input name="join_date" type="date" defaultValue={v("join_date")} /></label>
        <label className="f">
          Status
          <select name="status" defaultValue={v("status") || "Active"}>
            {RESOURCE_STATUSES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </label>
      </div>
      <label className="f">Skills (separated by ;)<input name="skills" defaultValue={v("skills")} /></label>
      <div className="actions">
        <button className="btn primary" type="submit" disabled={pending}>{pending ? "Saving…" : resource ? "Save changes" : "Add person"}</button>
      </div>
    </form>
  );
}
