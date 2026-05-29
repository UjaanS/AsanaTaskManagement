import type { AttentionFlag, DerivedTask, Filters } from "../types/ops";

export function applyFilters(tasks: DerivedTask[], filters: Filters, showOld: boolean): DerivedTask[] {
  const query = filters.query.trim().toLowerCase();

  return tasks.filter((task) => {
    if (!showOld && !task.includedByDefault) return false;
    if (filters.assignee && (task.assignee ?? "Unassigned") !== filters.assignee) return false;
    if (filters.project && task.project !== filters.project) return false;
    if (filters.priority && task.priority !== filters.priority) return false;
    if (filters.phase && task.currentPhase !== filters.phase) return false;
    if (filters.requestType && task.requestType !== filters.requestType) return false;
    if (filters.flag && !task.attentionFlags.includes(filters.flag as AttentionFlag)) return false;
    if (query) {
      const haystack = [task.id, task.title, task.project, task.assignee ?? "Unassigned", task.status ?? "", task.latestComment?.body ?? ""]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });
}

export function uniqueValues<T>(items: T[], getter: (item: T) => string | null | undefined): string[] {
  return [...new Set(items.map(getter).filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b));
}
