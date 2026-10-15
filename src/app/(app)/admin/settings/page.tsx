import { SettingsForm } from "@/components/SettingsForm";
import { getDb } from "@/lib/db";
import { requireView } from "@/lib/session";
import { getSettings } from "@/lib/store";

export default async function SettingsPage() {
  await requireView("settings");
  return (
    <>
      <h1>Settings</h1>
      <p className="sub">Every change is recorded in the audit trail. Utilization and stale-update thresholds are used from Phase 2.</p>
      <div className="card"><SettingsForm settings={getSettings(getDb())} /></div>
    </>
  );
}
