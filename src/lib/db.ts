// SQLite storage. The database file is created on first use and loaded from the input tabs in SEED_DIR
// (default: data/sample, the DUMMY data). Swap in the real files by pointing SEED_DIR at them and running
// `npm run db:seed -- --reset`.
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { errorCount, loadCsvDir, type TabRows } from "./importer";

export type DB = Database.Database;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  email TEXT PRIMARY KEY COLLATE NOCASE,
  name TEXT NOT NULL,
  role TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS profiles (profile TEXT PRIMARY KEY, description TEXT NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS resources (
  resource_id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL COLLATE NOCASE,
  employment_type TEXT NOT NULL,
  profile TEXT NOT NULL,
  seniority TEXT NOT NULL DEFAULT '',
  skills TEXT NOT NULL DEFAULT '',
  line_manager TEXT NOT NULL DEFAULT '',
  join_date TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS opportunities (
  opportunity_id TEXT PRIMARY KEY,
  opportunity_name TEXT NOT NULL,
  client_name TEXT NOT NULL,
  stage TEXT NOT NULL,
  currency TEXT NOT NULL,
  opportunity_value REAL NOT NULL,
  partner TEXT NOT NULL,
  bd_manager TEXT NOT NULL,
  initiation_date TEXT NOT NULL,
  stage_entered_date TEXT NOT NULL,
  expected_close_date TEXT NOT NULL,
  presales_resource_ids TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  data_issues TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS projects (
  project_id TEXT PRIMARY KEY,
  project_name TEXT NOT NULL,
  project_type TEXT NOT NULL,
  client_name TEXT NOT NULL,
  project_lead_email TEXT NOT NULL DEFAULT '',
  start_date TEXT NOT NULL DEFAULT '',
  planned_end_date TEXT NOT NULL DEFAULT '',
  forecast_end_date TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL,
  progress_pct REAL NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  project_value REAL,
  project_cost REAL,
  actual_cost_to_date REAL,
  margin_pct REAL,
  plan_link TEXT NOT NULL DEFAULT '',
  charter_link TEXT NOT NULL DEFAULT '',
  contract_link TEXT NOT NULL DEFAULT '',
  stakeholder_map_link TEXT NOT NULL DEFAULT '',
  source_opportunity_id TEXT NOT NULL DEFAULT '',
  is_draft INTEGER NOT NULL DEFAULT 0,
  data_issues TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS project_status_updates (
  project_id TEXT NOT NULL,
  week_start TEXT NOT NULL,
  status TEXT NOT NULL,
  progress_pct REAL NOT NULL,
  summary TEXT NOT NULL,
  key_risks_issues TEXT NOT NULL DEFAULT '',
  next_steps TEXT NOT NULL DEFAULT '',
  updated_by TEXT NOT NULL,
  PRIMARY KEY (project_id, week_start)
);
CREATE TABLE IF NOT EXISTS project_milestones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL,
  milestone TEXT NOT NULL,
  planned_date TEXT NOT NULL,
  actual_date TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS project_expected_team (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL,
  profile TEXT NOT NULL,
  quantity REAL NOT NULL,
  allocation_pct REAL NOT NULL,
  needed_from TEXT NOT NULL,
  needed_to TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS project_assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL DEFAULT '',
  opportunity_id TEXT NOT NULL DEFAULT '',
  resource_id TEXT NOT NULL,
  role_on_project TEXT NOT NULL,
  allocation_pct REAL NOT NULL,
  assigned_from TEXT NOT NULL,
  assigned_to TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS utilization (
  email TEXT NOT NULL COLLATE NOCASE,
  period_type TEXT NOT NULL,
  period_start TEXT NOT NULL,
  utilization_pct REAL NOT NULL,
  PRIMARY KEY (email, period_type, period_start)
);
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  actor_email TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL,
  field TEXT,
  old_value TEXT,
  new_value TEXT
);
CREATE INDEX IF NOT EXISTS audit_entity ON audit_log(entity, entity_id);
CREATE TABLE IF NOT EXISTS pipeline_snapshots (
  week_start TEXT NOT NULL,
  stage TEXT NOT NULL,
  count INTEGER NOT NULL,
  value_usd REAL NOT NULL,
  taken_at TEXT NOT NULL,
  PRIMARY KEY (week_start, stage)
);
`;

export function openDb(file: string): DB {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  migrate(db);
  return db;
}

/** Columns added after a table was first created, for databases made by an earlier version. */
const ADDED_COLUMNS: [table: string, column: string, ddl: string][] = [
  ["opportunities", "data_issues", "TEXT NOT NULL DEFAULT ''"],
  ["projects", "data_issues", "TEXT NOT NULL DEFAULT ''"],
];

function migrate(db: DB) {
  for (const [table, column, ddl] of ADDED_COLUMNS) {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    if (!cols.some((c) => c.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
  }
}

const TAB_ORDER: (keyof TabRows)[] = [
  "users",
  "profiles",
  "settings",
  "resources",
  "opportunities",
  "projects",
  "project_status_updates",
  "project_milestones",
  "project_expected_team",
  "project_assignments",
  "utilization",
];

/** Replaces every loaded tab with the given rows, in one transaction, and records the load in the audit trail. */
export function loadTabs(db: DB, data: TabRows, actor: string, source: string) {
  const insert = (table: string, rows: Record<string, unknown>[]) => {
    db.prepare(`DELETE FROM ${table}`).run();
    if (!rows.length) return;
    const cols = Object.keys(rows[0]);
    const stmt = db.prepare(`INSERT INTO ${table} (${cols.join(",")}) VALUES (${cols.map((c) => "@" + c).join(",")})`);
    for (const r of rows) stmt.run(r);
  };
  const now = new Date().toISOString();
  db.transaction(() => {
    for (const tab of TAB_ORDER) {
      insert(tab, data[tab] as Record<string, unknown>[]);
      db.prepare(
        "INSERT INTO audit_log (at, actor_email, entity, entity_id, action, new_value) VALUES (?, ?, ?, '*', 'import', ?)",
      ).run(now, actor, tab, `${data[tab].length} rows from ${source}`);
    }
  })();
}

export function seedFromDir(db: DB, dir: string, actor = "system") {
  const { data, errors } = loadCsvDir(dir);
  if (errorCount(errors)) {
    const lines = Object.entries(errors).flatMap(([tab, errs]) => errs.map((e) => `  ${tab}: ${e}`));
    throw new Error(`Input files in ${dir} failed validation:\n${lines.join("\n")}`);
  }
  loadTabs(db, data, actor, dir);
}

export const defaultSeedDir = () => process.env.SEED_DIR || path.join(process.cwd(), "data", "sample");
export const defaultDbPath = () => process.env.DATABASE_PATH || path.join(process.cwd(), "data", "tracker.db");

const g = globalThis as unknown as { __trackerDb?: DB };

/** Shared connection for the app. Seeds from SEED_DIR the first time the database is empty. */
export function getDb(): DB {
  if (!g.__trackerDb) {
    const db = openDb(defaultDbPath());
    const { n } = db.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number };
    if (n === 0) seedFromDir(db, defaultSeedDir());
    g.__trackerDb = db;
  }
  return g.__trackerDb;
}
