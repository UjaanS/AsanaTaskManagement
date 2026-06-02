import type { AttentionSeverity, PhaseKey } from "../types/ops";
import { addMonths, todayISO } from "./date";

// Asana statuses (frammer.com workspace, Status custom field gid 1208070038885837):
//   New/ To do · In Discussion · On Hold · In Dev · Done/ In Code review ·
//   Ready For QA · In QA · QA Done/ In ER · To Release/ ER Done · Verify on Demo ·
//   Live on Demo · Completed · Invalid · Internal Issue · Closed · Bug
//
// Status strings are matched case-insensitively. Add new Asana statuses here as the
// team introduces them; unknown statuses fall through to the "active" default.

const activeStatuses: PhaseKey[] = [
  "New/ To do",
  "In Discussion",
  "On Hold",
  "In Dev",
  "Done/ In Code review",
  "Ready For QA",
  "In QA",
  "QA Done/ In ER",
  "To Release/ ER Done",
  "Verify on Demo",
  "Bug",
];

const closedStatuses: PhaseKey[] = [
  "Live on Demo",
  "Completed",
  "Invalid",
  "Internal Issue",
  "Closed",
];

const qaStatuses: PhaseKey[] = ["Ready For QA", "In QA"];
const devStatuses: PhaseKey[] = ["In Dev", "Done/ In Code review", "Bug"];
const onHoldStatuses: PhaseKey[] = ["On Hold"];
const liveStatuses: PhaseKey[] = ["Live on Demo"];

const lower = (value: string) => value.toLowerCase();
const lowerSet = (values: string[]) => new Set(values.map(lower));

const activeSet = lowerSet(activeStatuses);
const closedSet = lowerSet(closedStatuses);
const qaSet = lowerSet(qaStatuses);
const devSet = lowerSet(devStatuses);
const onHoldSet = lowerSet(onHoldStatuses);
const liveSet = lowerSet(liveStatuses);

// Default view shows only tasks created in the last RECENT_TASK_MONTHS months.
// The toggle in the dashboard ("Show older tasks") releases this filter.
const RECENT_TASK_MONTHS = 3;

export const opsConfig = {
  recentTaskMonths: RECENT_TASK_MONTHS,
  // Rolling cutoff: 3 months back from today. Recomputed each call so the window
  // moves with the calendar — never hardcode a date.
  recentCreatedSince: (today: string = todayISO()) => addMonths(today, -RECENT_TASK_MONTHS),
  recentModifiedDays: 30,
  staleDays: 5,
  recentCommentDays: 3,
  qaDriftDays: 2,
  activeStatuses,
  closedStatuses,
  qaStatuses,
  devStatuses,
  onHoldStatuses,
  liveStatuses,
  isActive: (phase: PhaseKey | null | undefined) => Boolean(phase) && activeSet.has(lower(phase as string)),
  isClosed: (phase: PhaseKey | null | undefined) => Boolean(phase) && closedSet.has(lower(phase as string)),
  isQa: (phase: PhaseKey | null | undefined) => Boolean(phase) && qaSet.has(lower(phase as string)),
  isDev: (phase: PhaseKey | null | undefined) => Boolean(phase) && devSet.has(lower(phase as string)),
  isOnHold: (phase: PhaseKey | null | undefined) => Boolean(phase) && onHoldSet.has(lower(phase as string)),
  isLive: (phase: PhaseKey | null | undefined) => Boolean(phase) && liveSet.has(lower(phase as string)),
  liveCommentKeywords: ["live", "production", "released"],
  attentionSeverity: {
    eta_violation: "critical",
    missing_owner: "critical",
    high_priority_stale: "high",
    qa_drift: "high",
    possible_stale_status: "medium",
    missing_status: "medium",
    silent_work: "low",
  } satisfies Record<string, AttentionSeverity>,
};
