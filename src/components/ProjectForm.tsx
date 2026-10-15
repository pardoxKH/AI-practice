"use client";

import { useActionState } from "react";
import { saveProjectAction } from "@/app/actions";
import { CURRENCIES, type Project, PROJECT_STATUSES, PROJECT_TYPES, type User } from "@/lib/domain";

export function ProjectForm({ project, leads }: { project?: Project; leads: User[] }) {
  const [state, action, pending] = useActionState(saveProjectAction, undefined);
  const v = (k: keyof Project) => (project && project[k] !== null && project[k] !== undefined ? String(project[k]) : "");
  const status = project?.is_draft ? "On track" : v("status") || "On track";
  return (
    <form action={action} className="stack">
      {project && <input type="hidden" name="project_id" value={project.project_id} />}
      <input type="hidden" name="source_opportunity_id" value={v("source_opportunity_id")} />
      {state?.error && <div className="notice err">{state.error}</div>}
      <div className="fields">
        <label className="f">Project name<input name="project_name" required defaultValue={v("project_name")} /></label>
        <label className="f">Client<input name="client_name" required defaultValue={v("client_name")} /></label>
        <label className="f">
          Type
          <select name="project_type" defaultValue={v("project_type") || "Client"}>
            {PROJECT_TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </label>
        <label className="f">
          Project lead
          <select name="project_lead_email" defaultValue={v("project_lead_email")} required>
            <option value="">Choose…</option>
            {leads.map((u) => <option key={u.email} value={u.email}>{u.name} ({u.role})</option>)}
            {project?.project_lead_email && !leads.some((u) => u.email === project.project_lead_email) && (
              <option value={project.project_lead_email}>{project.project_lead_email} (not a user yet)</option>
            )}
          </select>
        </label>
        <label className="f">Start date<input name="start_date" type="date" required defaultValue={v("start_date")} /></label>
        <label className="f">Planned end date<input name="planned_end_date" type="date" required defaultValue={v("planned_end_date")} /></label>
        <label className="f">Forecast end date<input name="forecast_end_date" type="date" defaultValue={v("forecast_end_date")} /></label>
        <label className="f">
          Status
          <select name="status" defaultValue={status}>
            {PROJECT_STATUSES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </label>
        <label className="f">Progress %<input name="progress_pct" type="number" min={0} max={100} required defaultValue={v("progress_pct") || "0"} /></label>
      </div>
      <h2 style={{ margin: "8px 0 0" }}>Financials</h2>
      <div className="fields">
        <label className="f">
          Currency
          <select name="currency" defaultValue={v("currency") || "USD"}>
            {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
        <label className="f">Value<input name="project_value" inputMode="decimal" defaultValue={v("project_value")} /></label>
        <label className="f">Cost (budget)<input name="project_cost" inputMode="decimal" defaultValue={v("project_cost")} /></label>
        <label className="f">Actual cost to date<input name="actual_cost_to_date" inputMode="decimal" defaultValue={v("actual_cost_to_date")} /></label>
        <label className="f">Margin % (blank = calculated)<input name="margin_pct" inputMode="decimal" defaultValue={v("margin_pct")} /></label>
      </div>
      <h2 style={{ margin: "8px 0 0" }}>Documents (Google Workspace links)</h2>
      <div className="fields">
        <label className="f">Project plan<input name="plan_link" type="url" defaultValue={v("plan_link")} /></label>
        <label className="f">Charter<input name="charter_link" type="url" defaultValue={v("charter_link")} /></label>
        <label className="f">Contract<input name="contract_link" type="url" defaultValue={v("contract_link")} /></label>
        <label className="f">Stakeholder map<input name="stakeholder_map_link" type="url" defaultValue={v("stakeholder_map_link")} /></label>
      </div>
      <div className="actions">
        <button className="btn primary" type="submit" disabled={pending}>
          {pending ? "Saving…" : !project ? "Create project" : project.is_draft ? "Complete project setup" : "Save changes"}
        </button>
      </div>
    </form>
  );
}
