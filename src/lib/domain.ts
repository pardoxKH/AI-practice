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
