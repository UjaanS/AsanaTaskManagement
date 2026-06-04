import type { OpsTask } from "../../src/types/ops";
import { addDays, todayISO } from "../../src/lib/date";
import { opsConfig } from "../../src/lib/opsConfig";
import { fetchProjectTasks, fetchTaskStories } from "./client";
import type { AsanaServerConfig } from "./config";
import { normalizeAsanaTasks } from "./normalize";
import type { AsanaTask, AsanaTaskWithContext } from "./types";

// Each Asana REST call is network-latency bound (~0.5s RTT), so the only way to
// stay fast is to maximise parallelism. We fan out project task-lists and the
// per-task story fetches across bounded concurrency pools rather than serially.
// Asana's published limit is 150 req/min per token; these pools stay well under.
const projectFetchConcurrency = 8;
const storyFetchConcurrency = 10;

interface TaskRef {
  task: AsanaTask;
  projectGid: string;
  projectName: string;
}

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
  const today = todayISO();
  const includeOld = options.includeOld === true;
  const modifiedSince = includeOld ? undefined : `${opsConfig.recentCreatedSince(today)}T00:00:00Z`;

  // Phase 1: fetch every project's task list in PARALLEL (was sequential — the
  // dominant cost). Per-project failures are isolated so one bad project (revoked
  // access, deleted gid, 404) doesn't abort the rest of the sync.
  const perProjectRefs = await mapWithConcurrency(config.projectGids, projectFetchConcurrency, async (projectGid) => {
    try {
      const projectTasks = await fetchProjectTasks(projectGid, config, { modifiedSince });
      const projectName = config.projectNames[projectGid] ?? inferProjectName(projectTasks, projectGid);
      return projectTasks
        .filter((task) => isTaskWorthStoryFetch(task, today, config.syncLookbackDays, includeOld))
        .map((task) => ({ task, projectGid, projectName } satisfies TaskRef));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`fetchOpsTasks: project ${projectGid} failed, continuing with remaining projects:`, message);
      return [] as TaskRef[];
    }
  });

  // Phase 2: fetch stories for ALL eligible tasks through a single shared pool.
  // Previously the pool was rebuilt per project, so a project with 1 task wasted
  // 9 of 10 slots; flattening keeps the pool saturated across the whole run.
  const taskRefs = perProjectRefs.flat();
  const contexts: AsanaTaskWithContext[] = await mapWithConcurrency(taskRefs, storyFetchConcurrency, async (ref) => ({
    task: ref.task,
    projectGid: ref.projectGid,
    projectName: ref.projectName,
    stories: await fetchTaskStories(ref.task.gid, config),
  }));

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
