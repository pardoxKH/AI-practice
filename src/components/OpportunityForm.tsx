"use client";

import { useActionState } from "react";
import { saveOpportunityAction } from "@/app/actions";
import { ALL_STAGES, CURRENCIES, type Opportunity } from "@/lib/domain";

export function OpportunityForm({ opp, resources }: { opp?: Opportunity; resources: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState(saveOpportunityAction, undefined);
  const v = (k: keyof Opportunity) => (opp ? String(opp[k] ?? "") : "");
  return (
    <form action={action} className="stack">
      {opp && <input type="hidden" name="opportunity_id" value={opp.opportunity_id} />}
      {state?.error && <div className="notice err">{state.error}</div>}
      <div className="fields">
        <F label="Opportunity name"><input name="opportunity_name" required defaultValue={v("opportunity_name")} /></F>
        <F label="Client"><input name="client_name" required defaultValue={v("client_name")} /></F>
        <F label="Stage">
          <select name="stage" defaultValue={v("stage") || ALL_STAGES[0]}>
            {ALL_STAGES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </F>
        <F label="Value">
          <div style={{ display: "flex", gap: 8 }}>
            <select name="currency" defaultValue={v("currency") || "USD"} style={{ width: 90 }}>
              {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
            </select>
            <input name="opportunity_value" type="number" min="0" step="any" required defaultValue={v("opportunity_value")} />
          </div>
        </F>
        <F label="Partner"><input name="partner" required defaultValue={v("partner")} /></F>
        <F label="BD manager"><input name="bd_manager" required defaultValue={v("bd_manager")} /></F>
        <F label="Initiation date"><input name="initiation_date" type="date" required defaultValue={v("initiation_date")} /></F>
        <F label="Expected close date"><input name="expected_close_date" type="date" required defaultValue={v("expected_close_date")} /></F>
        <F label="Stage entered date" hint="Leave as is: it resets to today when the stage changes">
          <input name="stage_entered_date" type="date" defaultValue={v("stage_entered_date")} />
        </F>
        <F label="Presales resources" hint={`IDs separated by ";" e.g. ${resources.slice(0, 2).map((r) => r.id).join("; ")}`}>
          <input name="presales_resource_ids" list="resource-ids" defaultValue={v("presales_resource_ids")} />
          <datalist id="resource-ids">
            {resources.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </datalist>
        </F>
      </div>
      <F label="Notes (next step, blockers)"><textarea name="notes" defaultValue={v("notes")} /></F>
      <div className="actions">
        <button className="btn primary" type="submit" disabled={pending}>{pending ? "Saving…" : opp ? "Save changes" : "Create opportunity"}</button>
        <span className="small muted">Moving to Closed-Won creates a draft project for this deal.</span>
      </div>
    </form>
  );
}

function F({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="f">
      {label}
      {children}
      {hint && <span className="small muted" style={{ fontWeight: 400 }}>{hint}</span>}
    </label>
  );
}
