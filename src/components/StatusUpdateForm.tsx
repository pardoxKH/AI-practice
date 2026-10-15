"use client";

import { useActionState, useState } from "react";
import { saveStatusUpdateAction } from "@/app/actions";
import { type Project, PROJECT_STATUSES, type StatusUpdate } from "@/lib/domain";

/** Weekly update. Submitting again for the same week replaces that week's update. */
export function StatusUpdateForm({ project, week, existing }: { project: Project; week: string; existing?: StatusUpdate }) {
  const [state, action, pending] = useActionState(saveStatusUpdateAction, undefined);
  const [status, setStatus] = useState<string>(existing?.status ?? (project.is_draft ? "On track" : project.status));
  const risky = status === "At risk" || status === "Off track";
  return (
    <form action={action} className="stack">
      <input type="hidden" name="project_id" value={project.project_id} />
      {state?.error && <div className="notice err">{state.error}</div>}
      <div className="fields">
        <label className="f">Week starting (Monday)<input name="week_start" type="date" defaultValue={week} required /></label>
        <label className="f">
          Status
          <select name="status" value={status} onChange={(e) => setStatus(e.target.value)}>
            {PROJECT_STATUSES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </label>
        <label className="f">Progress %<input name="progress_pct" type="number" min={0} max={100} required defaultValue={existing?.progress_pct ?? project.progress_pct} /></label>
        <label className="f">Forecast end date<input name="forecast_end_date" type="date" defaultValue={project.forecast_end_date} /></label>
      </div>
      <label className="f">Summary<textarea name="summary" required defaultValue={existing?.summary} /></label>
      <label className="f">
        Key risks and issues{risky ? " (required when At risk or Off track)" : ""}
        <textarea name="key_risks_issues" required={risky} defaultValue={existing?.key_risks_issues} />
      </label>
      <label className="f">Next steps<textarea name="next_steps" defaultValue={existing?.next_steps} /></label>
      <div className="actions">
        <button className="btn primary" type="submit" disabled={pending}>{pending ? "Saving…" : existing ? "Replace this week's update" : "Submit weekly update"}</button>
      </div>
    </form>
  );
}
