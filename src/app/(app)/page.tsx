import Link from "next/link";
import { Bars } from "@/components/Bars";
import { Rag } from "@/components/Rag";
import { today } from "@/lib/dates";
import { getDb } from "@/lib/db";
import { isActiveProject, PIPELINE_STAGES, STAGE_SHORT } from "@/lib/domain";
import { defaultPeriodType, overAllocations, peopleHealth, practiceUtilization, underUtilized, weeksFrom } from "@/lib/people";
import { canView } from "@/lib/permissions";
import { byStage, formatMoney, growthHealth, needsAttention, pipelineKpis } from "@/lib/pipeline";
import { hasIssues } from "@/lib/issues";
import { deliveryHealth, isStale, latestUpdates } from "@/lib/projects";
import { displayCurrency, requireUser } from "@/lib/session";
import {
  getSettings,
  listAssignments,
  listOpportunities,
  listProjects,
  listResources,
  listStatusUpdates,
  listUtilization,
  snapshotPipelineIfDue,
} from "@/lib/store";

type Item = { key: string; kind: string; cls: string; href: string; title: string; sub: string; detail: string };

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

  const showProjects = canView(user.role, "projects");
  const projects = showProjects ? listProjects(db) : [];
  const active = projects.filter(isActiveProject);
  const delivery = deliveryHealth(projects);
  const latest = latestUpdates(showProjects ? listStatusUpdates(db) : []);
  const util = listUtilization(db);
  const periodType = defaultPeriodType(util);
  const practice = practiceUtilization(util, resources, periodType);
  const people = peopleHealth(practice, s);
  const under = underUtilized(util, resources, s, periodType, practice.period);
  const over = overAllocations(resources, listAssignments(db), weeksFrom(now, 12));

  const incompleteProjects = projects.filter(hasIssues).length;
  const incompleteOpps = opps.filter(hasIssues).length;
  const items: Item[] = [
    ...(incompleteProjects
      ? [{
          key: "missing-projects",
          kind: "Missing info",
          cls: "missing",
          href: "/projects?missing=1&status=all",
          title: `${incompleteProjects} ${incompleteProjects === 1 ? "project" : "projects"}`,
          sub: "Loaded from an incomplete workbook",
          detail: "Blank or invalid fields; figures that depend on them may be off",
        }]
      : []),
    ...(incompleteOpps
      ? [{
          key: "missing-opps",
          kind: "Missing info",
          cls: "missing",
          href: "/pipeline?missing=1",
          title: `${incompleteOpps} ${incompleteOpps === 1 ? "opportunity" : "opportunities"}`,
          sub: "Loaded from an incomplete workbook",
          detail: "Blank or invalid fields, or placeholder dates",
        }]
      : []),
    ...active
      .filter((p) => p.status === "Off track" || p.status === "At risk")
      .sort((a, b) => (a.status === "Off track" ? -1 : 1) - (b.status === "Off track" ? -1 : 1))
      .map((p) => ({
        key: `p-${p.project_id}`,
        kind: p.status,
        cls: p.status === "Off track" ? "overdue" : "aging",
        href: `/projects/${p.project_id}`,
        title: p.project_name,
        sub: `${p.client_name} · ${p.progress_pct}% done`,
        detail: latest.get(p.project_id)?.key_risks_issues || "No risks recorded",
      })),
    ...active
      .filter((p) => isStale(p, latest.get(p.project_id), s, now))
      .map((p) => ({
        key: `s-${p.project_id}`,
        kind: "Stale",
        cls: "stale",
        href: `/projects/${p.project_id}`,
        title: p.project_name,
        sub: p.client_name,
        detail: latest.get(p.project_id) ? `Last update for the week of ${latest.get(p.project_id)!.week_start}` : "No weekly update yet",
      })),
    ...attention.map((a) => ({
      key: `o-${a.opportunity.opportunity_id}`,
      kind: a.kind,
      cls: a.kind.toLowerCase(),
      href: `/pipeline/${a.opportunity.opportunity_id}`,
      title: a.opportunity.opportunity_name,
      sub: `${a.opportunity.client_name} · ${STAGE_SHORT[a.opportunity.stage]}`,
      detail: a.detail,
    })),
    ...over.map((o) => ({
      key: `x-${o.resource.resource_id}`,
      kind: "Over-allocated",
      cls: "overdue",
      href: `/resources/${o.resource.resource_id}`,
      title: o.resource.full_name,
      sub: o.resource.profile,
      detail: `Planned ${o.peakPct}% from the week of ${o.firstWeek}`,
    })),
    ...under.map((u) => ({
      key: `u-${u.resource.resource_id}`,
      kind: "Under-utilized",
      cls: "aging",
      href: `/resources/${u.resource.resource_id}`,
      title: u.resource.full_name,
      sub: `${u.resource.profile}${u.resource.employment_type === "Trainee" ? " · trainee" : ""}`,
      detail: `${u.pct}% in the ${periodType.toLowerCase()} of ${practice.period}, below ${s.underutilized_below_pct}%`,
    })),
  ];

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
        {showProjects && (
          <>
            <Kpi label="Active projects" value={String(active.length)} foot={`${projects.filter((p) => p.is_draft).length} drafts awaiting setup`} href="/projects" />
            <Kpi label="Projects at risk or off track" value={String(delivery.atRisk + delivery.offTrack)} foot={`${delivery.offTrack} off track · ${delivery.atRisk} at risk`} href="/projects" />
          </>
        )}
        <Kpi
          label="Practice utilization"
          value={practice.pct === null ? "–" : `${practice.pct}%`}
          foot={practice.period ? `FTEs, ${periodType.toLowerCase()} of ${practice.period} · target ${s.utilization_target_pct}%` : "No ops report loaded"}
          href="/utilization"
        />
        <Pending label="Open roles" phase={3} />
      </div>

      <div className="card section">
        <h2>Practice health</h2>
        <div className="grid health" style={{ marginBottom: 0 }}>
          {showProjects ? (
            <HealthItem title="Delivery" detail={delivery.reason} value={delivery.active ? delivery.rag : "Pending"} />
          ) : (
            <HealthItem title="Delivery" detail="Projects are not visible to your role" value="Pending" />
          )}
          <HealthItem title="People" detail={people.reason} value={people.rag} />
          {showPipeline ? (
            <HealthItem title="Growth" detail={growth.reason} value={growth.rag} />
          ) : (
            <HealthItem title="Growth" detail="Pipeline is not visible to your role" value="Pending" />
          )}
          <HealthItem title="Capacity" detail="Hiring gaps, from Phase 3" value="Pending" />
        </div>
      </div>

      <div className="grid two section">
        <div className="card">
          <h2>Needs attention</h2>
          {items.length === 0 ? (
            <p className="muted">Nothing needs attention right now.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <tbody>
                  {items.map((a) => (
                    <tr key={a.key}>
                      <td>
                        <span className={`flag ${a.cls}`}>{a.kind}</span>
                      </td>
                      <td>
                        <Link href={a.href}>{a.title}</Link>
                        <div className="small muted">{a.sub}</div>
                      </td>
                      <td className="small muted">{a.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="small muted" style={{ marginBottom: 0 }}>
            {showPipeline && `Aging means more than ${s.stage_aging_alert_days} days in the current stage. `}
            {showProjects && `Stale means no weekly update for more than ${s.stale_update_days} days.`}
          </p>
        </div>
        {showPipeline && (
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
        )}
      </div>
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
