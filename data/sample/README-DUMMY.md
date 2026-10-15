# Applied AI practice tracker: DUMMY sample data

All people, clients, emails, values and links are fictional placeholders. Replace each tab with the real file when ready.
Generated 2026-10-11. 'Today' in this data is 2026-10-11; latest ops week is 2026-10-05.

Scenarios built in on purpose, so every dashboard view has something to show:
- 12 active FTEs (1 on leave) + 5 trainees + 1 exited FTE (R018) = 18 resource rows.
- 4 ongoing client projects (P001-P004), 2 POCs (P005 active, P006 completed), 2 accelerators (P007 active, P008 on hold).
- Status mix: P001 At risk, P003 Off track (forecast slips ~6 weeks), P005 stale (last update 2026-09-28, >7 days).
- Over-allocation: R012 Khalid is planned at 120% from 2026-10-01 (P002 60 + P005 40 + P007 20).
- Under-utilization: R008 Ahmad drops to ~50-60% after POC P006 ended mid-Sept.
- Hiring gaps: Data Engineer (P003/P004) and MLOps/Data Scientist (P003) with open requisitions H001-H003; H004 filled by R012 (candidate C012 Joined).
- Pipeline: 13 opportunities across all 6 stages + Lost + On hold, USD and SAR; O013 is past its expected close date.
- Closed-Won O009-O012 link to projects P001-P004 via projects.source_opportunity_id.
- Utilization: weekly, one overall % per person per week (6 weeks), as ops report it. Weeks fully on leave are left out.
  The engagement/client split is not in this tab; the tracker derives it from project_assignments.
- project_assignments: project rows use project_id; presales rows on open opportunities use opportunity_id (10-15%).
- Currency: USD and SAR; usd_to_sar_rate = 3.75 in settings.

Files: `applied-ai-tracker-DUMMY-sample-data.xlsx` (one tab per schema tab, plus README) and `csv/<tab>.csv`.
