import type { DerivedTask } from "../types/ops";

export function groupTasks(tasks: DerivedTask[], key: "assignee" | "project"): Record<string, DerivedTask[]> {
  return tasks.reduce<Record<string, DerivedTask[]>>((acc, task) => {
    const group = key === "assignee" ? task.assignee ?? "Unassigned" : task.project;
    acc[group] = acc[group] ?? [];
    acc[group].push(task);
    return acc;
  }, {});
}

export function sortTasks(tasks: DerivedTask[], order: Record<string, number>): DerivedTask[] {
  return [...tasks].sort((a, b) => {
    const orderA = order[a.id];
    const orderB = order[b.id];
    if (orderA !== undefined || orderB !== undefined) {
      return (orderA ?? a.sortOrder) - (orderB ?? b.sortOrder);
    }
    return b.modifiedAt.localeCompare(a.modifiedAt);
  });
}
