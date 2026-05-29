# Asana Operations Command Center

Asana Operations Command Center (AOCC): a dense operational dashboard for assignee visibility, ETA monitoring, QA lifecycle tracking, stale-status detection, attention queues, timeline tracking, and WhatsApp-ready EOD summaries.

The dashboard runtime uses real Asana data through a server-side API proxy. Asana tokens must never be placed in `VITE_` variables or frontend code.

## Configure Asana

Create a local `.env` file from `.env.example` and set server-side values:

```bash
cp .env.example .env

ASANA_ACCESS_TOKEN=replace-with-server-side-token
ASANA_WORKSPACE_GID=...
ASANA_PROJECT_GIDS=project_gid_1,project_gid_2,project_gid_3
ASANA_SYNC_LOOKBACK_DAYS=30
DATABASE_URL=file:./dev.db
APP_SECRET=replace-with-a-long-random-local-secret
SYNC_INTERVAL_MS=300000
```

Create a Personal Access Token in Asana, paste it only into `.env` or save it from the in-app Settings tab, and never use a `VITE_` variable for it. `.env` is ignored by Git.

Project GIDs are visible in Asana project URLs:

```text
https://app.asana.com/0/{PROJECT_GID}/list
```

Optional project-specific mappings:

```bash
ASANA_PROJECT_NAMES_JSON={"project_gid_1":"Payment Gateway"}
ASANA_FIELD_MAP_JSON={"project_gid_1":{"status":"status_field_gid","priority":"priority_field_gid","requestType":"request_type_field_gid","eta":"eta_field_gid","qaState":"qa_state_field_gid","statusFieldName":"Status"},"project_gid_2":{"status":"different_status_field_gid","priority":"different_priority_field_gid","requestType":"different_request_type_field_gid","eta":"different_eta_field_gid","qaState":"different_qa_field_gid"}}
ASANA_STATUS_TO_PHASE_JSON={"Ready for QA":"QA","QA Failed":"QA_FAILED","QA Passed":"QA_PASSED"}
```

If a custom field mapping is missing, the server falls back to common field names such as `Status`, `Priority`, `Request Type`, `ETA`, and `QA State`. Missing values are returned safely so the dashboard can flag them.

Use diagnostics after adding your token and project IDs:

```bash
curl http://127.0.0.1:8787/api/asana/diagnostics
```

The diagnostics response lists each project's custom fields, field GIDs, field types, enum options, detected fallback mappings, configured mappings, and mapping warnings. Copy the field GIDs from that response into `ASANA_FIELD_MAP_JSON`.

## Run

```bash
npm install
npm run dev
```

`npm run dev` starts the server-side Asana API on `http://127.0.0.1:8787` and the Vite dashboard on `http://127.0.0.1:5173`.

The dashboard reads persisted SQLite snapshots. Use the Settings tab to save/validate a PAT and run Sync Now, or call:

```bash
curl -X POST http://127.0.0.1:8787/api/sync
```

Useful split commands:

```bash
npm run dev:server
npm run dev:client
npm run dev:api
npm run dev:web
```

After building, preview serves the built dashboard and `/api` from the same Node server:

```bash
npm run build
npm run preview
```

Open `http://127.0.0.1:8787`. This is different from Vite's default preview server because AOCC needs the server-side Asana API available at `/api/ops/tasks`.

## Deploy

Deploy AOCC as a Node web service, not as a static-only Vite site. The same Node process must serve both `dist/` and `/api/*`.

Recommended deployment settings:

```bash
Build command: npm install && npm run build
Start command: npm start
```

Required environment variables:

```bash
APP_SECRET=replace-with-a-long-random-secret
DATABASE_URL=file:./dev.db
```

Optional environment variables:

```bash
ASANA_ACCESS_TOKEN=replace-with-server-side-token
ASANA_WORKSPACE_GID=workspace_gid
ASANA_PROJECT_GIDS=project_gid_1,project_gid_2
CORS_ORIGIN=https://your-deployed-domain.example
```

If you deploy to a static host such as a plain Vite/Netlify static export, `/api/auth/pat` will return 404 because the custom Node server is not running. Use a Node-capable host such as Render, Railway, Fly.io, or another service that can run `npm start`. For production persistence, attach a persistent disk for `dev.db` or replace SQLite with a managed database.

## Verify

```bash
npm test
npm run build
git diff --check
curl http://127.0.0.1:8787/api/health
curl -X POST http://127.0.0.1:8787/api/sync
curl http://127.0.0.1:8787/api/asana/diagnostics
curl http://127.0.0.1:8787/api/ops/tasks
```

Open `http://127.0.0.1:5173` in dev mode. After sync, the dashboard should show persisted Asana tasks that were created on or after March 1, 2026, modified within `ASANA_SYNC_LOOKBACK_DAYS`, or recently reassigned when assignment story data is available.

## Troubleshooting

- Missing token: set `ASANA_ACCESS_TOKEN` in `.env`; do not prefix it with `VITE_`.
- Auth failure: regenerate the PAT or confirm the token can access the workspace/projects.
- Bad project ID: confirm `ASANA_PROJECT_GIDS` from the project URL and re-run diagnostics.
- Empty dashboard: run sync from Settings, then check that tasks match the inclusion rules and that filters are clear.
- Missing status/priority/ETA: run diagnostics, copy the correct custom field GIDs, and update `ASANA_FIELD_MAP_JSON`.
- Rate limit: wait briefly and retry; story/comment fetches are concurrency-limited for local use.

## Notes

- Runtime mock mode is not used.
- SQLite persistence uses `DATABASE_URL`; the default local file is `dev.db`.
- Asana credentials stay server-side in `ASANA_*` environment variables.
- PostgreSQL, Redis, worker queues, and WhatsApp API integration are not implemented yet.
- Drag-and-drop ordering is local UI state.
- The UI consumes `src/data/opsDataSource.ts`, which calls the internal `/api/ops/tasks` endpoint.
