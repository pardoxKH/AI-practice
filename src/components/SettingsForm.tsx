"use client";

import { useActionState } from "react";
import { saveSettingsAction } from "@/app/actions";
import type { Settings } from "@/lib/domain";

export function SettingsForm({ settings }: { settings: Settings }) {
  const [state, action, pending] = useActionState(saveSettingsAction, undefined);
  return (
    <form action={action} className="stack">
      {state?.error && <div className="notice err">{state.error}</div>}
      {state?.ok && <div className="notice ok">{state.ok}</div>}
      <div className="fields">
        <label className="f">
          Default reporting currency
          <select name="reporting_currency" defaultValue={settings.reporting_currency}>
            <option>USD</option><option>SAR</option>
          </select>
        </label>
        <label className="f">SAR per 1 USD<input name="usd_to_sar_rate" type="number" step="0.0001" min="0" defaultValue={settings.usd_to_sar_rate} /></label>
        <label className="f">Stage aging alert (days)<input name="stage_aging_alert_days" type="number" min="1" defaultValue={settings.stage_aging_alert_days} /></label>
        <label className="f">Utilization target %<input name="utilization_target_pct" type="number" min="0" max="100" defaultValue={settings.utilization_target_pct} /></label>
        <label className="f">Under-utilized below %<input name="underutilized_below_pct" type="number" min="0" max="100" defaultValue={settings.underutilized_below_pct} /></label>
        <label className="f">Stale update after (days)<input name="stale_update_days" type="number" min="1" defaultValue={settings.stale_update_days} /></label>
      </div>
      <div className="actions"><button className="btn primary" type="submit" disabled={pending}>Save settings</button></div>
    </form>
  );
}
