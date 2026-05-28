# Asana Operations Command Center

Mock-data V1 of the Asana Operations Command Center (AOCC): a dense operational dashboard for assignee visibility, ETA monitoring, QA lifecycle tracking, stale-status detection, attention queues, and WhatsApp-ready EOD summaries.

## Run

```bash
npm install
npm run dev
```

Then open the Vite local URL, usually `http://localhost:5173`.

## Notes

- V1 is frontend-only and mock-only.
- No Asana credentials, proxy, database, Redis, worker queue, or WhatsApp API integration are required.
- Drag-and-drop ordering is local UI state.
- The normalized task model and operations helpers are structured so a future Asana sync/API layer can replace `src/data/mockTasks.ts`.
