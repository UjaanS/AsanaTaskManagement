# AOCC Architecture Notes

AOCC is currently a real-Asana-backed dashboard with a minimal server-side API proxy. The UI is the source of truth for the visual system and should be preserved while the data and sync architecture matures.

## Current Data Flow

```text
Asana API -> server normalizer -> /api/ops/tasks -> OpsDataSource -> deriveTasks -> applyFilters -> dashboard views
```

- `server/asana/client.ts` calls Asana with server-side credentials.
- `server/asana/normalize.ts` converts Asana payloads into AOCC `OpsTask` records.
- `server/index.ts` exposes `GET /api/health`, `GET /api/ops/tasks`, and safe `GET /api/asana/diagnostics`.
- `src/data/opsDataSource.ts` is the browser data boundary.
- `src/types/ops.ts` defines the normalized operational task model.
- `src/lib/derive.ts` enriches raw tasks with ETA, stale, QA, and attention metadata.
- `src/lib/intelligence.ts` owns operational rules and recommended actions.
- `src/lib/summary.ts` generates EOD text.
- `src/lib/timeline.ts` owns timeline range helpers.

## Safe Change Rules

- Preserve current dark/light theme classes, phase classes, and timeline colors.
- Prefer logic-only PRs for intelligence, filtering, summary, and sync work.
- Avoid broad edits to `src/styles.css` unless the task is specifically UI readability.
- Keep mock fixtures as test-only contract examples.
- Add or update unit tests before changing operational rules.
- Do not replace existing view components wholesale; extract and wrap incrementally.
- Never add Asana tokens to frontend code, `VITE_` env vars, screenshots, docs, or tests.

## Backend Direction

The backend is read-only first:

- `sync/asanaClient` for raw Asana API calls and project custom-field discovery.
- `sync/normalizer` for project field/status mapping and AOCC task shaping.
- `api/dashboard` for grouped task payloads.
- `api/eod` for summary payloads.
- `worker` for incremental sync and later alert automation.

Not yet implemented: PostgreSQL snapshots, Redis cache, durable sync cursors, WhatsApp automation, Asana writes, and background escalation timers.
