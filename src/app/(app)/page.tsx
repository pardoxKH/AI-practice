import Link from "next/link";
import { Bars } from "@/components/Bars";
import { Rag } from "@/components/Rag";
import { today } from "@/lib/dates";
import { getDb } from "@/lib/db";
import { PIPELINE_STAGES, STAGE_SHORT } from "@/lib/domain";
import { canView } from "@/lib/permissions";
import { byStage, formatMoney, growthHealth, needsAttention, pipelineKpis } from "@/lib/pipeline";
import { displayCurrency, requireUser } from "@/lib/session";
import { getSettings, listOpportunities, listResources, snapshotPipelineIfDue } from "@/lib/store";

export default async function Overview() {
  const user = await requireUser();
  const db = getDb();
  const ccy = await displayCurrency();
  const now = today();
  const s = getSettings(db);
  const showPipeline = canView(user.role, "opportunities");
  snapshotPipelineIfDue(db, now);

  const resources = listResources(db).filter((r) => r.status !== "Exited");
  const ftes = resources.filter((r) => r.employment_type === "FTE").length;
  const trainees = resources.length - ftes;
  const onLeave = resources.filter((r) => r.status === "On leave").length;

  const opps = showPipeline ? listOpportunities(db) : [];
  const k = pipelineKpis(opps, ccy, s, now);
  const growth = growthHealth(opps, s, now);
  const attention = needsAttention(opps, s, now);
  const stages = byStage(opps, ccy, s, now).filter((r) => (PIPELINE_STAGES as readonly string[]).includes(r.stage));

  return (
    <>
      <h1>Practice overview</h1>
      <p className="sub">
        As of {now} · values in {ccy}
        {ccy === "SAR" && ` at ${s.usd_to_sar_rate} SAR per USD`}
      </p>

      <div className="grid kpis">
        {showPipeline && (
          <>
            <Kpi label="Open pipeline" value={formatMoney(k.openValue, ccy)} foot={`${k.openCount} open opportunities`} href="/pipeline?stage=open" />
            <Kpi
              label={`Expected to close ${k.quarterLabel}`}
              value={formatMoney(k.closingThisQuarterValue, ccy)}
              foot={`${k.closingThisQuarterCount} opportunities`}
            />
            <Kpi label={`Won in ${now.slice(0, 4)}`} value={formatMoney(k.wonYtdValue, ccy)} foot={`${k.wonYtdCount} deals`} href={`/pipeline?stage=${encodeURIComponent("Closed-Won & Delivery Handoff")}`} />
            <Kpi label="Past expected close" value={String(k.overdueCount)} foot={`${k.agingCount} more aging in stage`} />
          </>
        )}
        <Kpi label="Practice headcount" value={String(ftes + trainees)} foot={`${ftes} FTE · ${trainees} trainees${onLeave ? ` · ${onLeave} on leave` : ""}`} href="/resources" />
        <Pending label="Active projects" phase={2} />
        <Pending label="Practice utilization" phase={2} />
        <Pending label="Open roles" phase={3} />
      </div>

      <div className="card section">
        <h2>Practice health</h2>
        <div className="grid health" style={{ marginBottom: 0 }}>
          <HealthItem title="Delivery" detail="Project status, from Phase 2" value="Pending" />
          <HealthItem title="People" detail={`Utilization vs ${s.utilization_target_pct}% target, from Phase 2`} value="Pending" />
          {showPipeline ? (
            <HealthItem title="Growth" detail={growth.reason} value={growth.rag} />
          ) : (
            <HealthItem title="Growth" detail="Pipeline is not visible to your role" value="Pending" />
          )}
          <HealthItem title="Capacity" detail="Hiring gaps, from Phase 3" value="Pending" />
        </div>
      </div>

      {showPipeline && (
        <div className="grid two section">
          <div className="card">
            <h2>Needs attention</h2>
            {attention.length === 0 ? (
              <p className="muted">Nothing overdue or aging in the pipeline.</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <tbody>
                    {attention.map((a) => (
                      <tr key={a.opportunity.opportunity_id}>
                        <td>
                          <span className={`flag ${a.kind.toLowerCase()}`}>{a.kind}</span>
                        </td>
                        <td>
                          <Link href={`/pipeline/${a.opportunity.opportunity_id}`}>{a.opportunity.opportunity_name}</Link>
                          <div className="small muted">
                            {a.opportunity.client_name} · {STAGE_SHORT[a.opportunity.stage]}
                          </div>
                        </td>
                        <td className="small muted">{a.detail}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="small muted" style={{ marginBottom: 0 }}>
              Aging means more than {s.stage_aging_alert_days} days in the current stage.
            </p>
          </div>
          <div className="card">
            <h2>Pipeline by stage ({ccy})</h2>
            <Bars
              ariaLabel="Pipeline value by stage"
              rows={stages.map((r) => ({
                label: STAGE_SHORT[r.stage],
                value: r.value,
                display: `${formatMoney(r.value, ccy)} · ${r.count}`,
                tooltip: `${r.stage}: ${r.count} opportunities, ${formatMoney(r.value, ccy)}`,
                href: `/pipeline?stage=${encodeURIComponent(r.stage)}`,
                muted: r.stage === "Closed-Won & Delivery Handoff",
              }))}
            />
            <p className="small muted" style={{ marginBottom: 0 }}>
              Value and count per stage. Closed-Won is shown lighter because it is no longer open pipeline.
            </p>
          </div>
        </div>
      )}
    </>
  );
}

function Kpi({ label, value, foot, href }: { label: string; value: string; foot?: string; href?: string }) {
  const body = (
    <>
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {foot && <div className="foot">{foot}</div>}
    </>
  );
  return <div className="card kpi">{href ? <Link href={href} style={{ color: "inherit" }}>{body}</Link> : body}</div>;
}

function Pending({ label, phase }: { label: string; phase: number }) {
  return (
    <div className="card kpi pending">
      <div className="label">{label}</div>
      <div className="value">Coming in Phase {phase}</div>
    </div>
  );
}

function HealthItem({ title, detail, value }: { title: string; detail: string; value: "Green" | "Amber" | "Red" | "Pending" }) {
  return (
    <div>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{title}</div>
      <Rag value={value} label={value === "Pending" ? "Not yet tracked" : value} />
      <div className="small muted" style={{ marginTop: 4 }}>{detail}</div>
    </div>
  );
}
