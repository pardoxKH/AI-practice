// Shared vocabulary for the tracker. Values match requirements/input-files-schema.md (v2).

export const OPEN_STAGES = [
  "Lead Identification & Qualification",
  "Presales Engagement & Opportunity Shaping",
  "RFP Evaluation & Solution Architecture",
  "Proposal Submission & Pitch Defense",
  "Final Negotiation & Contracting",
] as const;

export const WON_STAGE = "Closed-Won & Delivery Handoff" as const;
export const PIPELINE_STAGES = [...OPEN_STAGES, WON_STAGE] as const;
export const OUTCOMES = ["Lost", "On hold"] as const;
export const ALL_STAGES = [...PIPELINE_STAGES, ...OUTCOMES] as const;

export type Stage = (typeof ALL_STAGES)[number];

/** Short labels for charts and tight table cells. */
export const STAGE_SHORT: Record<Stage, string> = {
  "Lead Identification & Qualification": "Lead & qualification",
  "Presales Engagement & Opportunity Shaping": "Presales & shaping",
  "RFP Evaluation & Solution Architecture": "RFP & architecture",
  "Proposal Submission & Pitch Defense": "Proposal & pitch",
  "Final Negotiation & Contracting": "Negotiation",
  "Closed-Won & Delivery Handoff": "Closed-Won",
  Lost: "Lost",
  "On hold": "On hold",
};

export const ROLES = ["Admin", "Project lead", "HR", "Leadership"] as const;
export type Role = (typeof ROLES)[number];

export const CURRENCIES = ["USD", "SAR"] as const;
export type Currency = (typeof CURRENCIES)[number];

export const EMPLOYMENT_TYPES = ["FTE", "Trainee"] as const;
export const PROJECT_STATUSES = ["On track", "At risk", "Off track", "Completed", "On hold"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number] | "Draft";
export const PROJECT_TYPES = ["Client", "POC", "Accelerator"] as const;
export const ENGAGEMENTS = ["Project", "Investment", "Presales", "Bench"] as const;
export type Engagement = (typeof ENGAGEMENTS)[number];
export const RESOURCE_STATUSES = ["Active", "On leave", "Exited"] as const;

export type User = { email: string; name: string; role: Role };

export type Opportunity = {
  opportunity_id: string;
  opportunity_name: string;
  client_name: string;
  stage: Stage;
  currency: Currency;
  opportunity_value: number;
  partner: string;
  bd_manager: string;
  initiation_date: string;
  stage_entered_date: string;
  expected_close_date: string;
  presales_resource_ids: string;
  notes: string;
  /** Problems found when the row was imported ("" when complete). Shown as "Missing info". */
  data_issues: string;
};

export type Resource = {
  resource_id: string;
  full_name: string;
  email: string;
  employment_type: (typeof EMPLOYMENT_TYPES)[number];
  profile: string;
  seniority: string;
  skills: string;
  line_manager: string;
  join_date: string;
  status: (typeof RESOURCE_STATUSES)[number];
};

export type Settings = {
  reporting_currency: Currency;
  usd_to_sar_rate: number;
  utilization_target_pct: number;
  underutilized_below_pct: number;
  stale_update_days: number;
  /** Days in one stage before an open opportunity is flagged as aging. Tracker default, not in the input schema. */
  stage_aging_alert_days: number;
};

export const DEFAULT_SETTINGS: Settings = {
  reporting_currency: "USD",
  usd_to_sar_rate: 3.75,
  utilization_target_pct: 80,
  underutilized_below_pct: 50,
  stale_update_days: 7,
  stage_aging_alert_days: 45,
};

export const isOpen = (stage: Stage) => (OPEN_STAGES as readonly string[]).includes(stage);

export type Project = {
  project_id: string;
  project_name: string;
  project_type: (typeof PROJECT_TYPES)[number];
  client_name: string;
  project_lead_email: string;
  start_date: string;
  planned_end_date: string;
  forecast_end_date: string;
  status: ProjectStatus;
  progress_pct: number;
  currency: Currency;
  project_value: number | null;
  project_cost: number | null;
  actual_cost_to_date: number | null;
  margin_pct: number | null;
  plan_link: string;
  charter_link: string;
  contract_link: string;
  stakeholder_map_link: string;
  source_opportunity_id: string;
  is_draft: number;
  /** Problems found when the row was imported ("" when complete). Shown as "Missing info". */
  data_issues: string;
};

export type StatusUpdate = {
  project_id: string;
  week_start: string;
  status: ProjectStatus;
  progress_pct: number;
  summary: string;
  key_risks_issues: string;
  next_steps: string;
  updated_by: string;
};

export type Milestone = { id: number; project_id: string; milestone: string; planned_date: string; actual_date: string };
export type ExpectedTeam = {
  id: number;
  project_id: string;
  profile: string;
  quantity: number;
  allocation_pct: number;
  needed_from: string;
  needed_to: string;
};
export type Assignment = {
  id: number;
  project_id: string;
  opportunity_id: string;
  resource_id: string;
  role_on_project: string;
  allocation_pct: number;
  assigned_from: string;
  assigned_to: string;
};
export type UtilizationRow = { email: string; period_type: "Week" | "Month"; period_start: string; utilization_pct: number };

/** Projects that are still being delivered (not finished, paused or awaiting setup). */
export const isActiveProject = (p: Pick<Project, "status" | "is_draft">) =>
  !p.is_draft && p.status !== "Completed" && p.status !== "On hold";
