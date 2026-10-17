// Reads and writes. Every write records who changed what, and when, in audit_log.
import type { DB } from "./db";
import {
  type Assignment,
  DEFAULT_SETTINGS,
  type ExpectedTeam,
  type Milestone,
  type Opportunity,
  type Project,
  type StatusUpdate,
  type UtilizationRow,
  PIPELINE_STAGES,
  ALL_STAGES,
  type Resource,
  type Settings,
  type User,
  WON_STAGE,
} from "./domain";
import { valueIn, weekStart } from "./pipeline";

type Row = Record<string, unknown>;

export type AuditEntry = {
  id: number;
  at: string;
  actor_email: string;
  entity: string;
  entity_id: string;
  action: string;
  field: string | null;
  old_value: string | null;
  new_value: string | null;
};

function audit(db: DB, actor: string, entity: string, entityId: string, action: string, field?: string, oldV?: unknown, newV?: unknown) {
  db.prepare(
    "INSERT INTO audit_log (at, actor_email, entity, entity_id, action, field, old_value, new_value) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  ).run(new Date().toISOString(), actor, entity, entityId, action, field ?? null, str(oldV), str(newV));
}

const str = (v: unknown) => (v === undefined || v === null ? null : String(v));

function auditDiff(db: DB, actor: string, entity: string, id: string, before: Row, after: Row) {
  for (const key of Object.keys(after)) {
    if (str(before[key]) !== str(after[key])) audit(db, actor, entity, id, "update", key, before[key], after[key]);
  }
}

function update(db: DB, table: string, keyCol: string, id: string, values: Row) {
  const cols = Object.keys(values).filter((c) => c !== keyCol);
  db.prepare(`UPDATE ${table} SET ${cols.map((c) => `${c} = @${c}`).join(", ")} WHERE ${keyCol} = @__id`).run({ ...values, __id: id });
}

function insert(db: DB, table: string, values: Row) {
  const cols = Object.keys(values);
  db.prepare(`INSERT INTO ${table} (${cols.join(",")}) VALUES (${cols.map((c) => "@" + c).join(",")})`).run(values);
}

/** Next ID in a prefixed sequence, e.g. O013 -> O014. */
export function nextId(db: DB, table: string, col: string, prefix: string): string {
  const rows = db.prepare(`SELECT ${col} AS id FROM ${table} WHERE ${col} LIKE ?`).all(`${prefix}%`) as { id: string }[];
  const max = rows.reduce((m, r) => Math.max(m, Number(r.id.slice(prefix.length)) || 0), 0);
  return `${prefix}${String(max + 1).padStart(3, "0")}`;
}

// ---------- users ----------

export const listUsers = (db: DB) => db.prepare("SELECT * FROM users ORDER BY role, name").all() as User[];
export const getUser = (db: DB, email: string) =>
  db.prepare("SELECT * FROM users WHERE email = ?").get(email.trim().toLowerCase()) as User | undefined;

export function saveUser(db: DB, actor: string, user: User) {
  const u = { ...user, email: user.email.trim().toLowerCase() };
  db.transaction(() => {
    const before = getUser(db, u.email);
    if (before) {
      update(db, "users", "email", u.email, u);
      auditDiff(db, actor, "users", u.email, before, u);
    } else {
      insert(db, "users", u);
      audit(db, actor, "users", u.email, "create", "role", null, u.role);
    }
  })();
}

export function deleteUser(db: DB, actor: string, email: string) {
  db.transaction(() => {
    const before = getUser(db, email);
    if (!before) return;
    db.prepare("DELETE FROM users WHERE email = ?").run(before.email);
    audit(db, actor, "users", before.email, "delete", "role", before.role, null);
  })();
}

// ---------- settings ----------

export function getSettings(db: DB): Settings {
  const rows = db.prepare("SELECT key, value FROM settings").all() as { key: string; value: string }[];
  const s: Settings = { ...DEFAULT_SETTINGS };
  for (const { key, value } of rows) {
    if (!(key in s)) continue;
    const k = key as keyof Settings;
    if (k === "reporting_currency") s.reporting_currency = value === "SAR" ? "SAR" : "USD";
    else if (!Number.isNaN(Number(value))) (s as Record<string, unknown>)[k] = Number(value);
  }
  return s;
}

export function saveSettings(db: DB, actor: string, next: Partial<Settings>) {
  const current = getSettings(db);
  db.transaction(() => {
    for (const [key, value] of Object.entries(next)) {
      if (value === undefined || str(current[key as keyof Settings]) === str(value)) continue;
      db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, String(value));
      audit(db, actor, "settings", key, "update", "value", current[key as keyof Settings], value);
    }
  })();
}

// ---------- resources ----------

export const listProfiles = (db: DB) =>
  db.prepare("SELECT profile, description FROM profiles ORDER BY profile").all() as { profile: string; description: string }[];
export const listResources = (db: DB) => db.prepare("SELECT * FROM resources ORDER BY resource_id").all() as Resource[];
export const getResource = (db: DB, id: string) =>
  db.prepare("SELECT * FROM resources WHERE resource_id = ?").get(id) as Resource | undefined;

export function saveResource(db: DB, actor: string, input: Omit<Resource, "resource_id"> & { resource_id?: string }): string {
  return db.transaction(() => {
    const before = input.resource_id ? getResource(db, input.resource_id) : undefined;
    const id = before?.resource_id ?? nextId(db, "resources", "resource_id", "R");
    const row = { ...input, resource_id: id, email: input.email.trim().toLowerCase() };
    if (before) {
      update(db, "resources", "resource_id", id, row);
      auditDiff(db, actor, "resources", id, before, row);
    } else {
      insert(db, "resources", row);
      audit(db, actor, "resources", id, "create", "full_name", null, row.full_name);
    }
    return id;
  })();
}

// ---------- opportunities ----------

export const listOpportunities = (db: DB) =>
  db.prepare("SELECT * FROM opportunities ORDER BY opportunity_id").all() as Opportunity[];
export const getOpportunity = (db: DB, id: string) =>
  db.prepare("SELECT * FROM opportunities WHERE opportunity_id = ?").get(id) as Opportunity | undefined;

export type OpportunityInput = Omit<Opportunity, "opportunity_id" | "stage_entered_date" | "data_issues"> & { stage_entered_date?: string };

export type SaveResult = { id: string; draftProjectId?: string };

export function createOpportunity(db: DB, actor: string, input: OpportunityInput, today: string): SaveResult {
  return db.transaction(() => {
    const id = nextId(db, "opportunities", "opportunity_id", "O");
    const row: Opportunity = { ...input, opportunity_id: id, stage_entered_date: input.stage_entered_date || today, data_issues: "" };
    insert(db, "opportunities", row);
    audit(db, actor, "opportunities", id, "create", "stage", null, row.stage);
    const draftProjectId = row.stage === WON_STAGE ? createDraftProject(db, actor, row) : undefined;
    return { id, draftProjectId };
  })();
}

/**
 * Updates an opportunity. A stage change resets stage_entered_date to today (unless the editor set it
 * explicitly), and a move to Closed-Won creates a draft project linked back to the opportunity.
 */
export function updateOpportunity(db: DB, actor: string, id: string, input: OpportunityInput, today: string): SaveResult {
  return db.transaction(() => {
    const before = getOpportunity(db, id);
    if (!before) throw new Error(`Opportunity ${id} not found`);
    const stageChanged = before.stage !== input.stage;
    const enteredEdited = input.stage_entered_date && input.stage_entered_date !== before.stage_entered_date;
    // Saving through the form validates every field, so any import flag no longer applies.
    const row: Opportunity = {
      ...input,
      data_issues: "",
      opportunity_id: id,
      stage_entered_date: stageChanged && !enteredEdited ? today : input.stage_entered_date || before.stage_entered_date,
    };
    update(db, "opportunities", "opportunity_id", id, row);
    auditDiff(db, actor, "opportunities", id, before, row);
    const draftProjectId = stageChanged && row.stage === WON_STAGE ? createDraftProject(db, actor, row) : undefined;
    return { id, draftProjectId };
  })();
}

export type ProjectLink = { project_id: string; project_name: string; status: string; is_draft: number };

export const projectForOpportunity = (db: DB, oppId: string) =>
  db.prepare("SELECT project_id, project_name, status, is_draft FROM projects WHERE source_opportunity_id = ?").get(oppId) as
    | ProjectLink
    | undefined;

export const listDraftProjects = (db: DB) =>
  db.prepare("SELECT project_id, project_name, client_name, source_opportunity_id FROM projects WHERE is_draft = 1 ORDER BY project_id").all() as {
    project_id: string;
    project_name: string;
    client_name: string;
    source_opportunity_id: string;
  }[];

/** Closed-Won handoff: one draft project per opportunity, for the admin to complete in Phase 2. */
function createDraftProject(db: DB, actor: string, o: Opportunity): string | undefined {
  if (projectForOpportunity(db, o.opportunity_id)) return undefined;
  const id = nextId(db, "projects", "project_id", "P");
  insert(db, "projects", {
    project_id: id,
    project_name: o.opportunity_name,
    project_type: "Client",
    client_name: o.client_name,
    status: "Draft",
    currency: o.currency,
    project_value: o.opportunity_value,
    source_opportunity_id: o.opportunity_id,
    is_draft: 1,
  });
  audit(db, actor, "projects", id, "create", "source_opportunity_id", null, o.opportunity_id);
  return id;
}

// ---------- projects ----------

export const listProjects = (db: DB) => db.prepare("SELECT * FROM projects ORDER BY project_id").all() as Project[];
export const getProject = (db: DB, id: string) => db.prepare("SELECT * FROM projects WHERE project_id = ?").get(id) as Project | undefined;

export type ProjectInput = Omit<Project, "project_id" | "is_draft" | "data_issues"> & { project_id?: string };

/** Creates or updates a project. Saving the full form completes a draft from a Closed-Won handoff. */
export function saveProject(db: DB, actor: string, input: ProjectInput): string {
  return db.transaction(() => {
    const before = input.project_id ? getProject(db, input.project_id) : undefined;
    const id = before?.project_id ?? nextId(db, "projects", "project_id", "P");
    // Saving the full form validates every field, so any import flag no longer applies.
    const row: Project = { ...input, project_id: id, project_lead_email: input.project_lead_email.trim().toLowerCase(), is_draft: 0, data_issues: "" };
    if (before) {
      update(db, "projects", "project_id", id, row);
      auditDiff(db, actor, "projects", id, before, row);
    } else {
      insert(db, "projects", row);
      audit(db, actor, "projects", id, "create", "project_name", null, row.project_name);
    }
    return id;
  })();
}

export const listStatusUpdates = (db: DB, projectId?: string) =>
  (projectId
    ? db.prepare("SELECT * FROM project_status_updates WHERE project_id = ? ORDER BY week_start DESC").all(projectId)
    : db.prepare("SELECT * FROM project_status_updates ORDER BY project_id, week_start DESC").all()) as StatusUpdate[];

/**
 * Records the weekly update for a project and week (re-submitting the same week replaces it), and
 * carries its status and progress onto the project. The forecast end date can be moved at the same time.
 */
export function saveStatusUpdate(db: DB, actor: string, u: StatusUpdate, forecastEndDate?: string) {
  db.transaction(() => {
    const project = getProject(db, u.project_id);
    if (!project) throw new Error(`Project ${u.project_id} not found`);
    const before = db.prepare("SELECT * FROM project_status_updates WHERE project_id = ? AND week_start = ?").get(u.project_id, u.week_start) as
      | StatusUpdate
      | undefined;
    const key = `${u.project_id}@${u.week_start}`;
    if (before) {
      db.prepare(
        `UPDATE project_status_updates SET status=@status, progress_pct=@progress_pct, summary=@summary, key_risks_issues=@key_risks_issues,
         next_steps=@next_steps, updated_by=@updated_by WHERE project_id=@project_id AND week_start=@week_start`,
      ).run(u);
      auditDiff(db, actor, "project_status_updates", key, before, u);
    } else {
      insert(db, "project_status_updates", u);
      audit(db, actor, "project_status_updates", key, "create", "status", null, u.status);
    }
    const next = {
      ...project,
      status: u.status,
      progress_pct: u.progress_pct,
      forecast_end_date: forecastEndDate === undefined ? project.forecast_end_date : forecastEndDate,
    };
    update(db, "projects", "project_id", project.project_id, next);
    auditDiff(db, actor, "projects", project.project_id, project, next);
  })();
}

export const listMilestones = (db: DB, projectId: string) =>
  db.prepare("SELECT * FROM project_milestones WHERE project_id = ? ORDER BY planned_date, id").all(projectId) as Milestone[];

export function addMilestone(db: DB, actor: string, m: Omit<Milestone, "id">) {
  db.transaction(() => {
    const { lastInsertRowid } = db
      .prepare("INSERT INTO project_milestones (project_id, milestone, planned_date, actual_date) VALUES (@project_id, @milestone, @planned_date, @actual_date)")
      .run(m);
    audit(db, actor, "project_milestones", String(lastInsertRowid), "create", "milestone", null, `${m.project_id}: ${m.milestone}`);
  })();
}

export function setMilestoneActual(db: DB, actor: string, id: number, actual: string) {
  db.transaction(() => {
    const before = db.prepare("SELECT * FROM project_milestones WHERE id = ?").get(id) as Milestone | undefined;
    if (!before || before.actual_date === actual) return;
    db.prepare("UPDATE project_milestones SET actual_date = ? WHERE id = ?").run(actual, id);
    audit(db, actor, "project_milestones", String(id), "update", "actual_date", before.actual_date, actual);
  })();
}

export const listExpectedTeam = (db: DB, projectId?: string) =>
  (projectId
    ? db.prepare("SELECT * FROM project_expected_team WHERE project_id = ? ORDER BY needed_from, profile").all(projectId)
    : db.prepare("SELECT * FROM project_expected_team ORDER BY project_id, needed_from").all()) as ExpectedTeam[];

export function addExpectedTeam(db: DB, actor: string, t: Omit<ExpectedTeam, "id">) {
  db.transaction(() => {
    const { lastInsertRowid } = db
      .prepare(
        "INSERT INTO project_expected_team (project_id, profile, quantity, allocation_pct, needed_from, needed_to) VALUES (@project_id, @profile, @quantity, @allocation_pct, @needed_from, @needed_to)",
      )
      .run(t);
    audit(db, actor, "project_expected_team", String(lastInsertRowid), "create", "profile", null, `${t.project_id}: ${t.quantity} × ${t.profile} at ${t.allocation_pct}%`);
  })();
}

export const getExpectedTeamRow = (db: DB, id: number) =>
  db.prepare("SELECT * FROM project_expected_team WHERE id = ?").get(id) as ExpectedTeam | undefined;

export function deleteExpectedTeam(db: DB, actor: string, id: number) {
  db.transaction(() => {
    const before = getExpectedTeamRow(db, id);
    if (!before) return;
    db.prepare("DELETE FROM project_expected_team WHERE id = ?").run(id);
    audit(db, actor, "project_expected_team", String(id), "delete", "profile", `${before.project_id}: ${before.quantity} × ${before.profile}`, null);
  })();
}

// ---------- assignments ----------

export const listAssignments = (db: DB, f: { projectId?: string; opportunityId?: string; resourceId?: string } = {}) => {
  const filters = { project_id: f.projectId, opportunity_id: f.opportunityId, resource_id: f.resourceId };
  const set = Object.entries(filters).filter(([, v]) => v) as [string, string][];
  const where = set.map(([c]) => `${c} = ?`);
  const args = set.map(([, v]) => v);
  return db
    .prepare(`SELECT * FROM project_assignments ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY assigned_from, id`)
    .all(...args) as Assignment[];
};

export const getAssignment = (db: DB, id: number) => db.prepare("SELECT * FROM project_assignments WHERE id = ?").get(id) as Assignment | undefined;

const describeAssignment = (a: Omit<Assignment, "id">) =>
  `${a.resource_id} on ${a.project_id || a.opportunity_id} at ${a.allocation_pct}% (${a.assigned_from} to ${a.assigned_to})`;

export function addAssignment(db: DB, actor: string, a: Omit<Assignment, "id">): number {
  return db.transaction(() => {
    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO project_assignments (project_id, opportunity_id, resource_id, role_on_project, allocation_pct, assigned_from, assigned_to)
         VALUES (@project_id, @opportunity_id, @resource_id, @role_on_project, @allocation_pct, @assigned_from, @assigned_to)`,
      )
      .run(a);
    audit(db, actor, "project_assignments", String(lastInsertRowid), "create", "assignment", null, describeAssignment(a));
    return Number(lastInsertRowid);
  })();
}

export function deleteAssignment(db: DB, actor: string, id: number) {
  db.transaction(() => {
    const before = getAssignment(db, id);
    if (!before) return;
    db.prepare("DELETE FROM project_assignments WHERE id = ?").run(id);
    audit(db, actor, "project_assignments", String(id), "delete", "assignment", describeAssignment(before), null);
  })();
}

// ---------- utilization (ops report) ----------

export const listUtilization = (db: DB) =>
  db.prepare("SELECT * FROM utilization ORDER BY period_type, period_start, email").all() as UtilizationRow[];

export type UtilizationImport = { rows: number; periods: string[]; replaced: number; unknownEmails: string[] };

/**
 * Loads an ops utilization report. Every period the report contains is replaced as a whole, so
 * re-importing the same period never duplicates rows. Unknown emails are kept and reported back.
 */
export function importUtilization(db: DB, actor: string, rows: UtilizationRow[], source: string): UtilizationImport {
  return db.transaction(() => {
    const periods = [...new Set(rows.map((r) => `${r.period_type}|${r.period_start}`))].sort();
    let replaced = 0;
    const del = db.prepare("DELETE FROM utilization WHERE period_type = ? AND period_start = ?");
    for (const p of periods) replaced += del.run(...p.split("|")).changes;
    const ins = db.prepare(
      "INSERT OR REPLACE INTO utilization (email, period_type, period_start, utilization_pct) VALUES (@email, @period_type, @period_start, @utilization_pct)",
    );
    for (const r of rows) ins.run({ ...r, email: r.email.toLowerCase() });
    const known = new Set((db.prepare("SELECT email FROM resources").all() as { email: string }[]).map((r) => r.email.toLowerCase()));
    const unknownEmails = [...new Set(rows.map((r) => r.email.toLowerCase()).filter((e) => !known.has(e)))].sort();
    const label = periods.map((p) => p.replace("|", " ")).join(", ");
    audit(db, actor, "utilization", "*", "import", "periods", replaced ? `${replaced} rows` : null, `${rows.length} rows for ${label} from ${source}`);
    return { rows: rows.length, periods: periods.map((p) => p.replace("|", " ")), replaced, unknownEmails };
  })();
}

// ---------- audit ----------

export function listAudit(db: DB, opts: { entity?: string; entityId?: string; limit?: number } = {}): AuditEntry[] {
  const where: string[] = [];
  const args: unknown[] = [];
  if (opts.entity) {
    where.push("entity = ?");
    args.push(opts.entity);
  }
  if (opts.entityId) {
    where.push("entity_id = ?");
    args.push(opts.entityId);
  }
  const sql = `SELECT * FROM audit_log ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY id DESC LIMIT ?`;
  return db.prepare(sql).all(...args, opts.limit ?? 200) as AuditEntry[];
}

// ---------- weekly snapshots ----------

export type SnapshotRow = { week_start: string; stage: string; count: number; value_usd: number };

/** Records this week's pipeline by stage once; later calls in the same week are no-ops. */
export function snapshotPipelineIfDue(db: DB, today: string): boolean {
  const week = weekStart(today);
  const exists = db.prepare("SELECT 1 FROM pipeline_snapshots WHERE week_start = ? LIMIT 1").get(week);
  if (exists) return false;
  const opps = listOpportunities(db);
  const s = getSettings(db);
  const stmt = db.prepare("INSERT INTO pipeline_snapshots (week_start, stage, count, value_usd, taken_at) VALUES (?, ?, ?, ?, ?)");
  const now = new Date().toISOString();
  db.transaction(() => {
    for (const stage of ALL_STAGES) {
      const rows = opps.filter((o) => o.stage === stage);
      stmt.run(week, stage, rows.length, rows.reduce((t, o) => t + valueIn(o, "USD", s), 0), now);
    }
  })();
  return true;
}

export const listSnapshots = (db: DB, weeks = 12) =>
  db
    .prepare(
      `SELECT * FROM pipeline_snapshots WHERE week_start IN
       (SELECT DISTINCT week_start FROM pipeline_snapshots ORDER BY week_start DESC LIMIT ?) ORDER BY week_start`,
    )
    .all(weeks) as SnapshotRow[];

export { PIPELINE_STAGES };

/** True when the data came from the bundled DUMMY sample (data/sample), so the header can say so. */
export function isDummyData(db: DB): boolean {
  const row = db.prepare("SELECT new_value FROM audit_log WHERE action = 'import' ORDER BY id DESC LIMIT 1").get() as
    | { new_value: string }
    | undefined;
  return !row || /data[\\/]sample/.test(row.new_value);
}
