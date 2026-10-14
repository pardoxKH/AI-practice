# Applied AI Practice Tracker

A live dashboard for the Applied AI practice's leadership: projects, people, pipeline and hiring in one place,
replacing the separate spreadsheets. Requirements: `requirements/tracker-requirements.md` and
`requirements/input-files-schema.md` (v2, signed off 2026-10-11) in the project files.

## Phase 1 (this release)

- **Google sign-in** (Auth.js). Only people in the `users` tab can sign in; their role comes from that tab on every request.
- **Roles** per the signed-off matrix: Admin edits; Project leads and Leadership view the pipeline; HR has no pipeline access.
- **Overview**: pipeline KPI tiles, practice-health RAG (Growth live; Delivery, People and Capacity arrive in Phases 2 and 3),
  needs-attention list (deals past expected close, deals aging in stage), pipeline by stage.
- **Opportunities pipeline**: funnel by stage (count and value), Lost and On hold, average days in stage, open value by partner
  and BD manager, filterable list (stage, client, partner, BD manager, search), detail page with change history.
- **Editing** (Admin): create and edit opportunities. A stage change resets the stage-entered date to today.
  Moving a deal to Closed-Won creates a draft project linked to it.
- **USD / SAR** toggle in the header, using the admin-maintained rate (default 3.75).
- **Resource master list**, **users and roles**, **settings**, and an **audit trail** of every change.
- **Weekly pipeline snapshots** (by stage) for trend charts later.

No win probability or weighted pipeline in v1, as agreed.

## Run it locally on the dummy data

```bash
npm install
cp .env.example .env.local   # then set AUTH_SECRET (npx auth secret) and AUTH_DEV_LOGIN=true
npm run dev                  # http://localhost:3000
```

With `AUTH_DEV_LOGIN=true` the sign-in page offers a demo login as any user in the `users` tab, so you can try every role
without Google credentials. Set `TRACKER_TODAY=2026-10-11` to see the dummy data exactly as generated.

## Google sign-in

1. Google Cloud console → APIs & Services → Credentials → Create OAuth client ID (Web application).
2. Authorized redirect URI: `https://<your-host>/api/auth/callback/google` (and `http://localhost:3000/api/auth/callback/google` for local).
3. Set `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `AUTH_SECRET`. Optionally `GOOGLE_WORKSPACE_DOMAIN=yourfirm.com` to lock to company accounts.
4. Put your own address in `BOOTSTRAP_ADMIN_EMAILS` so you can sign in as Admin before the real `users` tab is loaded.

## Data

The app stores everything in SQLite (`DATABASE_PATH`, default `data/tracker.db`). On first start it loads the input tabs from
`SEED_DIR` (default `data/sample`, the **DUMMY** data). Each tab is one CSV named after the tab, with the exact headers from
`input-files-schema.md`; export each Google Sheet tab as CSV.

To switch to the real data, keep the workbook (or CSVs) in `data/local/`, which git ignores, so it never reaches the repo:

```bash
npm run db:seed -- --file data/local/tracker.xlsx --check            # validate only: problems listed per tab and row
npm run db:seed -- --file data/local/tracker.xlsx --reset            # replace the loaded tabs with the workbook
npm run db:seed -- --file data/local/tracker.xlsx --reset --partial  # still in progress: load the rows that pass, list the rest
```

`--dir path/to/csvs` works the same way for one CSV per tab. Put your own Google address in `BOOTSTRAP_ADMIN_EMAILS`
(or in the `users` tab) so you can sign in once the dummy users are replaced.

Phase 1 loads `users`, `profiles`, `settings`, `resources`, `opportunities` and `projects` (projects only so Closed-Won
handoffs get the next project ID). The `utilization` tab is validated now (one overall % per person per period, as ops
report it; the engagement split comes from planned allocations) and loaded in Phase 2. `project_assignments` is validated too: each row points at a project (Project or Investment
time) or at an opportunity (Presales time). Other tabs are read in later phases.

## Code map

| Path | What |
|---|---|
| `src/lib/domain.ts` | Stages, roles, types, default settings |
| `src/lib/pipeline.ts` | Pure calculations: KPIs, aging, currency, RAG, needs attention |
| `src/lib/importer.ts` | CSV loading and validation per tab |
| `src/lib/db.ts`, `src/lib/store.ts` | SQLite schema, reads and audited writes, Closed-Won handoff, snapshots |
| `src/lib/permissions.ts` | Permissions matrix |
| `src/auth.ts`, `src/lib/session.ts` | Google sign-in, role lookup, guards |
| `src/app/(app)/…` | Pages |

`npm test` runs the unit tests; CI also runs lint, typecheck, validates the sample files and builds.

## Deploying

No hosting constraint was set. The Dockerfile builds a standalone server; mount a persistent volume at `/data` for the
SQLite database (for example Fly.io or Render with a disk, or a small VM). Set the same environment variables as `.env.example`.
