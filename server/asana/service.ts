import type { OpsTask } from "../../src/types/ops";
import { addDays, todayISO } from "../../src/lib/date";
import { opsConfig } from "../../src/lib/opsConfig";
import { fetchProjectTasks, fetchTaskStories } from "./client";
import type { AsanaServerConfig } from "./config";
import { normalizeAsanaTasks } from "./normalize";
import type { AsanaTask, AsanaTaskWithContext } from "./types";

const storyFetchConcurrency = 4;

export async function fetchOpsTasks(config: AsanaServerConfig): Promise<OpsTask[]> {
  const contexts: AsanaTaskWithContext[] = [];
  const today = todayISO();

  for (const projectGid of config.projectGids) {
    const projectTasks = await fetchProjectTasks(projectGid, config);
    const projectName = config.projectNames[projectGid] ?? inferProjectName(projectTasks, projectGid);
    const eligibleTasks = projectTasks.filter((task) => isTaskWorthStoryFetch(task, today, config.syncLookbackDays));

    const projectContexts = await mapWithConcurrency(eligibleTasks, storyFetchConcurrency, async (task) => ({
      task,
      projectGid,
      projectName,
      stories: await fetchTaskStories(task.gid, config),
    }));

    contexts.push(...projectContexts);
  }

  return normalizeAsanaTasks(contexts, config);
}

function inferProjectName(tasks: Awaited<ReturnType<typeof fetchProjectTasks>>, projectGid: string): string {
  const project = tasks.flatMap((task) => task.projects ?? []).find((item) => item.gid === projectGid);
  return project?.name ?? projectGid;
}

function isTaskWorthStoryFetch(task: AsanaTask, today: string, lookbackDays: number): boolean {
  if (task.completed && !task.completed_at) return false;
  const modifiedCutoff = addDays(today, -lookbackDays);
  const createdAt = normalizeDate(task.created_at);
  const modifiedAt = normalizeDate(task.modified_at);
  return Boolean(createdAt && createdAt >= opsConfig.inclusionStartDate) || Boolean(modifiedAt && modifiedAt >= modifiedCutoff);
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
