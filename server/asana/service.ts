import type { OpsTask } from "../../src/types/ops";
import { addDays, todayISO } from "../../src/lib/date";
import { opsConfig } from "../../src/lib/opsConfig";
import { fetchProjectTasks, fetchTaskStories } from "./client";
import type { AsanaServerConfig } from "./config";
import { normalizeAsanaTasks } from "./normalize";
import type { AsanaTask, AsanaTaskWithContext } from "./types";

const storyFetchConcurrency = 4;

export interface FetchOpsTasksOptions {
  // When false (default), only tasks created in the last opsConfig.recentTaskMonths
  // are returned, and Asana is queried with modified_since to reduce wire volume.
  // When true, no created_at filter is applied and Asana is queried without
  // modified_since so the dashboard can show the full history.
  includeOld?: boolean;
}

export async function fetchOpsTasks(
  config: AsanaServerConfig,
  options: FetchOpsTasksOptions = {},
): Promise<OpsTask[]> {
  const contexts: AsanaTaskWithContext[] = [];
  const today = todayISO();
  const includeOld = options.includeOld === true;
  const modifiedSince = includeOld ? undefined : `${opsConfig.recentCreatedSince(today)}T00:00:00Z`;

  // Isolate per-project failures: one bad project (revoked access, deleted gid,
  // 404, etc.) must not abort the rest of the sync. Logged with the gid so the
  // operator can fix the offending entry and re-sync.
  for (const projectGid of config.projectGids) {
    try {
      const projectTasks = await fetchProjectTasks(projectGid, config, { modifiedSince });
      const projectName = config.projectNames[projectGid] ?? inferProjectName(projectTasks, projectGid);
      const eligibleTasks = projectTasks.filter((task) => isTaskWorthStoryFetch(task, today, config.syncLookbackDays, includeOld));

      const projectContexts = await mapWithConcurrency(eligibleTasks, storyFetchConcurrency, async (task) => ({
        task,
        projectGid,
        projectName,
        stories: await fetchTaskStories(task.gid, config),
      }));

      contexts.push(...projectContexts);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`fetchOpsTasks: project ${projectGid} failed, continuing with remaining projects:`, message);
    }
  }

  return normalizeAsanaTasks(contexts, config, today, { includeOld });
}

function inferProjectName(tasks: Awaited<ReturnType<typeof fetchProjectTasks>>, projectGid: string): string {
  const project = tasks.flatMap((task) => task.projects ?? []).find((item) => item.gid === projectGid);
  return project?.name ?? projectGid;
}

function isTaskWorthStoryFetch(task: AsanaTask, today: string, lookbackDays: number, includeOld: boolean): boolean {
  if (task.completed && !task.completed_at) return false;
  if (includeOld) return true;
  const createdAt = normalizeDate(task.created_at);
  // Strict default view: created_at within the recent window.
  // Also keep tasks recently modified within lookbackDays as a safety net for
  // story-fetch eligibility (normalize.ts is the strict enforcer of created_at).
  if (createdAt && createdAt >= opsConfig.recentCreatedSince(today)) return true;
  const modifiedAt = normalizeDate(task.modified_at);
  return Boolean(modifiedAt && modifiedAt >= addDays(today, -lookbackDays));
}

function normalizeDate(value: string | null | undefined): string | null {
  return value?.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? null;
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, mapper: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const current = index;
      index += 1;
      results[current] = await mapper(items[current]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}
