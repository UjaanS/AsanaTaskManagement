import type { OpsComment, OpsPhase, OpsTask, PhaseKey, Priority, QAEvent } from "../../src/types/ops";
import { addDays, todayISO } from "../../src/lib/date";
import { opsConfig } from "../../src/lib/opsConfig";
import type { AsanaFieldMap, AsanaServerConfig } from "./config";
import type { AsanaCustomField, AsanaStory, AsanaTaskWithContext } from "./types";

const FALLBACK_PHASE: PhaseKey = "New/ To do";
const COMPLETED_PHASE: PhaseKey = "Completed";

export const fieldNameFallbacks = {
  status: ["status", "stage", "task status"],
  priority: ["priority", "severity"],
  requestType: ["request type", "type", "ticket type"],
  eta: ["eta", "estimated completion", "target date"],
  qaState: ["qa state", "qa status", "qa"],
};

export function normalizeAsanaTasks(items: AsanaTaskWithContext[], config: AsanaServerConfig, today = todayISO()): OpsTask[] {
  return items
    .map((item, index) => normalizeAsanaTask(item, config, today, index))
    .filter((task) => shouldIncludeTask(task, today, config.syncLookbackDays))
    .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
}

export function normalizeAsanaTask(item: AsanaTaskWithContext, config: AsanaServerConfig, today = todayISO(), index = 0): OpsTask {
  const { task, projectGid, projectName, stories } = item;
  const fieldMap = config.fieldMap[projectGid] ?? {};
  const status = getMappedFieldValue(task.custom_fields, fieldMap, "status");
  const priorityRaw = getMappedFieldValue(task.custom_fields, fieldMap, "priority");
  const requestType = getMappedFieldValue(task.custom_fields, fieldMap, "requestType") ?? "Unknown";
  const eta = getMappedFieldDate(task.custom_fields, fieldMap, "eta") ?? normalizeDate(task.due_on ?? task.due_at) ?? null;
  const qaState = getMappedFieldValue(task.custom_fields, fieldMap, "qaState");
  const phase = resolvePhase(status, qaState, task.completed);
  const comments = normalizeComments(stories);
  const phases = buildPhases(task.created_at, status, phase, stories, fieldMap);
  const qaEvents = buildQaEvents(phases);

  if (!status && process.env.NODE_ENV !== "production") {
    console.warn(`Asana task ${task.gid} has no mapped status field for project ${projectGid}.`);
  }

  return {
    id: task.gid,
    title: task.name,
    asanaUrl: task.permalink_url,
    project: projectName,
    projectGid,
    assignee: task.assignee?.name ?? null,
    assigneeGid: task.assignee?.gid ?? null,
    createdAt: normalizeDate(task.created_at) ?? today,
    modifiedAt: normalizeDate(task.modified_at) ?? today,
    assignmentDate: inferAssignmentDate(stories) ?? normalizeDate(task.created_at) ?? today,
    recentlyReassigned: hasRecentAssignment(stories, today, config.syncLookbackDays),
    status,
    phase,
    priority: normalizePriority(priorityRaw),
    requestType,
    qaState,
    eta,
    dueDate: normalizeDate(task.due_on ?? task.due_at),
    completedAt: normalizeDate(task.completed_at),
    liveDate: opsConfig.isLive(phase) ? normalizeDate(task.completed_at ?? task.modified_at) : null,
    comments,
    latestComment: comments[0],
    phases,
    qaEvents,
    sortOrder: index + 1,
  };
}

export function getMappedFieldValue(
  fields: AsanaCustomField[] | undefined,
  fieldMap: AsanaFieldMap,
  key: keyof Pick<AsanaFieldMap, "status" | "priority" | "requestType" | "qaState">,
): string | null {
  const field = findField(fields, fieldMap[key], fieldNameFallbacks[key]);
  return fieldValue(field);
}

export function getMappedFieldDate(fields: AsanaCustomField[] | undefined, fieldMap: AsanaFieldMap, key: "eta"): string | null {
  const field = findField(fields, fieldMap[key], fieldNameFallbacks[key]);
  return fieldDate(field) ?? normalizeDate(fieldValue(field));
}

function findField(fields: AsanaCustomField[] | undefined, gid: string | undefined, fallbackNames: string[]): AsanaCustomField | undefined {
  if (!fields?.length) return undefined;
  if (gid) {
    const byGid = fields.find((field) => field.gid === gid);
    if (byGid) return byGid;
  }
  return fields.find((field) => fallbackNames.includes((field.name ?? "").trim().toLowerCase()));
}

function fieldValue(field: AsanaCustomField | undefined): string | null {
  return field?.enum_value?.name ?? field?.display_value ?? field?.text_value ?? (field?.number_value !== undefined && field?.number_value !== null ? String(field.number_value) : null);
}

function fieldDate(field: AsanaCustomField | undefined): string | null {
  return normalizeDate(field?.date_value?.date ?? field?.date_value?.date_time);
}

function normalizePriority(value: string | null): Priority {
  const normalized = (value ?? "").toLowerCase();
  if (normalized.includes("critical") || normalized.includes("urgent") || normalized === "p0") return "Critical";
  if (normalized.includes("high") || normalized === "p1") return "High";
  if (normalized.includes("low") || normalized === "p3") return "Low";
  return "Medium";
}

function resolvePhase(status: string | null, qaState: string | null, completed: boolean | undefined): PhaseKey {
  if (completed) return COMPLETED_PHASE;
  if (qaState && opsConfig.isQa(qaState)) return qaState;
  return status && status.trim() ? status.trim() : FALLBACK_PHASE;
}

function normalizeComments(stories: AsanaStory[]): OpsComment[] {
  return stories
    .filter((story) => story.resource_subtype === "comment_added" && story.text)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 8)
    .map((story) => ({
      id: story.gid,
      author: story.created_by?.name ?? "Unknown",
      body: story.text ?? "",
      createdAt: normalizeDate(story.created_at) ?? todayISO(),
    }));
}

function buildPhases(createdAt: string, status: string | null, fallbackPhase: PhaseKey, stories: AsanaStory[], fieldMap: AsanaFieldMap): OpsPhase[] {
  const statusFieldName = fieldMap.statusFieldName ?? "Status";
  const changes = stories
    .map((story) => parseStatusChange(story, statusFieldName))
    .filter((change): change is { from: string | null; to: string; date: string; author: string | null } => Boolean(change))
    .sort((a, b) => a.date.localeCompare(b.date));

  if (changes.length === 0) {
    return [{ type: fallbackPhase, start: normalizeDate(createdAt) ?? todayISO(), end: null }];
  }

  const phases: OpsPhase[] = [];
  const createdDate = normalizeDate(createdAt) ?? changes[0].date;
  const firstPhase = changes[0].from?.trim() || FALLBACK_PHASE;
  if (createdDate < changes[0].date) phases.push({ type: firstPhase, start: createdDate, end: changes[0].date });

  changes.forEach((change, index) => {
    const type = change.to.trim() || fallbackPhase;
    phases.push({
      type,
      start: change.date,
      end: changes[index + 1]?.date ?? null,
      tester: opsConfig.isQa(type) ? change.author ?? undefined : undefined,
    });
  });

  return phases.length ? phases : [{ type: fallbackPhase, start: createdDate, end: null }];
}

// QA bounce = a transition from a QA-family status (Ready For QA / In QA) back to a
// dev-family status (In Dev / Done in Code review / Bug). Asana does not expose a
// "QA Failed" status in this workspace; failure manifests purely as the transition.
function buildQaEvents(phases: OpsPhase[]): QAEvent[] {
  const events: QAEvent[] = [];
  for (let i = 1; i < phases.length; i++) {
    const prev = phases[i - 1];
    const curr = phases[i];
    if (opsConfig.isQa(prev.type) && opsConfig.isDev(curr.type)) {
      events.push({
        id: `bounce-${curr.start}-${i}`,
        type: "failed",
        at: curr.start,
        tester: prev.tester,
        reason: curr.reason,
      });
    } else if (opsConfig.isQa(curr.type) && !opsConfig.isQa(prev.type)) {
      events.push({
        id: `to-qa-${curr.start}-${i}`,
        type: "moved_to_qa",
        at: curr.start,
        tester: curr.tester,
      });
    }
  }
  return events;
}

function parseStatusChange(story: AsanaStory, statusFieldName: string) {
  if (!story.text) return null;
  const escaped = escapeRegex(statusFieldName);
  const fromTo = story.text.match(new RegExp(`changed\\s+${escaped}\\s+from\\s+"?([^"]+)"?\\s+to\\s+"?([^"]+)"?`, "i"));
  const date = normalizeDate(story.created_at);
  if (fromTo && date) return { from: fromTo[1].trim(), to: fromTo[2].trim(), date, author: story.created_by?.name ?? null };
  const toOnly = story.text.match(new RegExp(`changed\\s+${escaped}\\s+to\\s+"?([^"]+)"?`, "i"));
  if (toOnly && date) return { from: null, to: toOnly[1].trim(), date, author: story.created_by?.name ?? null };
  return null;
}

function inferAssignmentDate(stories: AsanaStory[]): string | null {
  const assignment = stories
    .filter((story) => /assigned/i.test(story.text ?? "") || story.resource_subtype === "assigned")
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  return normalizeDate(assignment?.created_at);
}

function hasRecentAssignment(stories: AsanaStory[], today: string, lookbackDays: number): boolean {
  const cutoff = addDays(today, -lookbackDays);
  return stories.some((story) => (/assigned/i.test(story.text ?? "") || story.resource_subtype === "assigned") && normalizeDate(story.created_at)! >= cutoff);
}

function shouldIncludeTask(task: OpsTask, today: string, lookbackDays: number): boolean {
  return task.createdAt >= opsConfig.inclusionStartDate || task.modifiedAt >= addDays(today, -lookbackDays) || Boolean(task.recentlyReassigned);
}

function normalizeDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = value.match(/\d{4}-\d{2}-\d{2}/);
  return match?.[0] ?? null;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
