# Asana Operations Command Center

Asana Operations Command Center (AOCC): a dense operational dashboard for assignee visibility, ETA monitoring, QA lifecycle tracking, stale-status detection, attention queues, timeline tracking, and WhatsApp-ready EOD summaries.

The dashboard runtime uses real Asana data through server-side API routes. Each user saves their own Asana PAT into an encrypted, httpOnly session cookie; tokens must never be placed in `VITE_` variables or frontend code.

## Configure Asana

Create a local `.env` file from `.env.example` and set server-side values:

```bash
cp .env.example .env

ASANA_SYNC_LOOKBACK_DAYS=30
APP_SECRET=replace-with-a-long-random-local-secret
```

Create a Personal Access Token in Asana and save it from the in-app Settings modal. The PAT is encrypted and stored only in an httpOnly cookie for that browser session. `.env` is ignored by Git.

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

Use diagnostics locally after adding project IDs:

```bash
curl http://127.0.0.1:8787/api/asana/diagnostics
```

The diagnostics response lists each project's custom fields, field GIDs, field types, enum options, detected fallback mappings, configured mappings, and mapping warnings. Copy the field GIDs from that response into `ASANA_FIELD_MAP_JSON`.

## Run

```bash
npm install
npm run dev
```

`npm run dev` starts the local API proxy on `http://127.0.0.1:8787` and the Vite dashboard on `http://127.0.0.1:5173`.

Use the Settings button to save/validate a PAT. The dashboard fetches Asana data through `/api/ops/tasks` using the encrypted httpOnly session cookie.

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

## Deploy To Vercel

AOCC is deployable as a Vite app with Vercel serverless API routes under `/api`. No separate Render, Railway, Fly.io, or long-running Node backend is required.

Vercel project settings:

```bash
Framework: Vite
Build command: npm install && npm run build
Output directory: dist
```

Required Vercel environment variable:

```bash
APP_SECRET=replace-with-a-long-random-secret
```

Optional environment variables:

```bash
ASANA_PROJECT_GIDS=project_gid_1,project_gid_2
ASANA_WORKSPACE_GID=workspace_gid
```

Do not set a shared `ASANA_ACCESS_TOKEN` in Vercel. Users enter their own PAT in Settings; `/api/auth/pat` validates it and stores it in an encrypted, signed, httpOnly cookie. `/api/ops/tasks` reads only the current user's cookie and returns `401` when no session exists. The Settings Logout button clears the cookie.

## Verify

```bash
npm test
npm run build
git diff --check
curl http://127.0.0.1:8787/api/health
curl http://127.0.0.1:8787/api/ops/tasks
```

Open `http://127.0.0.1:5173` in dev mode. After saving a PAT in Settings, the dashboard should show Asana tasks that were created on or after March 1, 2026, modified within `ASANA_SYNC_LOOKBACK_DAYS`, or recently reassigned when assignment story data is available.

## Troubleshooting

- Missing token/session: open Settings and save your Asana PAT.
- Auth failure: regenerate the PAT or confirm the token can access the workspace/projects.
- Bad project ID: confirm `ASANA_PROJECT_GIDS` from the project URL and re-run diagnostics.
- Empty dashboard: check that tasks match the inclusion rules and that filters are clear.
- Missing status/priority/ETA: run diagnostics, copy the correct custom field GIDs, and update `ASANA_FIELD_MAP_JSON`.
- Rate limit: wait briefly and retry; story/comment fetches are concurrency-limited for local use.

## Notes

- Runtime mock mode is not used.
- User Asana credentials stay encrypted in httpOnly cookies and are not exposed to frontend JavaScript.
- PostgreSQL, Redis, worker queues, and WhatsApp API integration are not implemented yet.
- Drag-and-drop ordering is local UI state.
- The UI consumes `src/data/opsDataSource.ts`, which calls the internal `/api/ops/tasks` endpoint.
