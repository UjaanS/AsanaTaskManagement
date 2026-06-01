import type { AttentionFlag, DerivedTask, Filters } from "../types/ops";
import { flagLabels } from "../lib/theme";
import { uniqueValues } from "../lib/ops";

interface FilterBarProps {
  tasks: DerivedTask[];
  filters: Filters;
  showOld: boolean;
  onFiltersChange: (filters: Filters) => void;
  onShowOldChange: (showOld: boolean) => void;
}

const flags = Object.keys(flagLabels) as AttentionFlag[];

export function FilterBar({ tasks, filters, showOld, onFiltersChange, onShowOldChange }: FilterBarProps) {
  const assignees = uniqueValues(tasks, (task) => task.assignee ?? "Unassigned");
  const projects = uniqueValues(tasks, (task) => task.project);
  // Phase options reflect whatever Asana statuses are actually present in the synced
  // data — no hardcoded list. New Asana statuses appear automatically.
  const phases = uniqueValues(tasks, (task) => task.currentPhase);

  const update = (key: keyof Filters, value: string) => onFiltersChange({ ...filters, [key]: value });

  return (
    <div className="filter-bar">
      <input
        className="search-input"
        value={filters.query}
        onChange={(event) => update("query", event.target.value)}
        placeholder="Search task, project, owner, comment"
      />
      <Select label="Owner" value={filters.assignee} options={assignees} onChange={(value) => update("assignee", value)} />
      <Select label="Project" value={filters.project} options={projects} onChange={(value) => update("project", value)} />
      <Select label="Phase" value={filters.phase} options={phases} onChange={(value) => update("phase", value)} />
      <Select label="Flag" value={filters.flag} options={flags} optionLabels={flagLabels} onChange={(value) => update("flag", value)} />
      <label className="toggle-pill">
        <input type="checkbox" checked={showOld} onChange={(event) => onShowOldChange(event.target.checked)} />
        Show Old
      </label>
    </div>
  );
}

interface SelectProps<T extends string> {
  label: string;
  value: string;
  options: T[];
  optionLabels?: Record<T, string>;
  onChange: (value: string) => void;
}

function Select<T extends string>({ label, value, options, optionLabels, onChange }: SelectProps<T>) {
  return (
    <label className="select-wrap">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">All</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {optionLabels?.[option] ?? option}
          </option>
        ))}
      </select>
    </label>
  );
}
