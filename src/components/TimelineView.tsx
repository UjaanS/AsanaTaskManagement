import { useEffect, useMemo, useRef, useState } from "react";
import { addDays, daysBetween, formatLong, formatShort, isWeekend, todayISO, toDate } from "../lib/date";
import { getRange, groupTasks, sortTasks } from "../lib/ops";
import { phaseClass, phaseLabels } from "../lib/theme";
import type { DerivedTask, RangePreset, TimelineGroupKey } from "../types/ops";

const dayWidth = 38;

export function TimelineView({ tasks }: { tasks: DerivedTask[] }) {
  const today = todayISO();
  const [groupKey, setGroupKey] = useState<TimelineGroupKey>("assignee");
  const [preset, setPreset] = useState<RangePreset>("month");
  const [customStart, setCustomStart] = useState(addDays(today, -14));
  const [customEnd, setCustomEnd] = useState(addDays(today, 14));
  const range = getRange(preset, customStart, customEnd);
  const days = useMemo(() => Array.from({ length: range.totalDays }, (_, index) => addDays(range.start, index)), [range.start, range.totalDays]);
  const groups = groupTasks(tasks, groupKey);
  const groupNames = Object.keys(groups).sort((a, b) => a.localeCompare(b));
  const headerRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const todayOffset = daysBetween(range.start, today);
    if (bodyRef.current) bodyRef.current.scrollLeft = Math.max(0, (todayOffset - 5) * dayWidth);
  }, [range.start, today]);

  const syncHeader = () => {
    if (headerRef.current && bodyRef.current) headerRef.current.scrollLeft = bodyRef.current.scrollLeft;
  };

  return (
    <section className="timeline-view">
      <div className="timeline-toolbar">
        <div className="segmented">
          <button className={groupKey === "assignee" ? "active" : ""} type="button" onClick={() => setGroupKey("assignee")}>By employee</button>
          <button className={groupKey === "project" ? "active" : ""} type="button" onClick={() => setGroupKey("project")}>By project</button>
        </div>
        <div className="segmented">
          {([
            ["week", "Week"],
            ["previous_week", "Prev week"],
            ["month", "Month"],
            ["previous_month", "Prev month"],
            ["custom", "Custom"],
          ] as [RangePreset, string][]).map(([key, label]) => (
            <button key={key} className={preset === key ? "active" : ""} type="button" onClick={() => setPreset(key)}>{label}</button>
          ))}
        </div>
        {preset === "custom" && (
          <div className="custom-range">
            <input type="date" value={customStart} onChange={(event) => setCustomStart(event.target.value)} />
            <input type="date" value={customEnd} onChange={(event) => setCustomEnd(event.target.value)} />
          </div>
        )}
        <span className="range-label">{formatLong(range.start)} - {formatLong(addDays(range.start, range.totalDays - 1))}</span>
      </div>

      <div className="timeline-shell">
        <div className="timeline-left timeline-corner">{groupKey === "assignee" ? "EMPLOYEE / TASK" : "PROJECT / TASK"}</div>
        <div className="timeline-header" ref={headerRef}>
          <div className="timeline-days" style={{ width: range.totalDays * dayWidth }}>
            {days.map((day) => (
              <div className={`timeline-day ${day === today ? "today" : ""} ${isWeekend(day) ? "weekend" : ""}`} key={day}>
                <span>{toDate(day).toLocaleDateString("en", { weekday: "narrow" })}</span>
                <strong>{toDate(day).getDate()}</strong>
              </div>
            ))}
          </div>
        </div>

        <div className="timeline-left timeline-rows">
          {groupNames.map((group) => (
            <div key={group}>
              <div className="timeline-group-row">{group}<span>{groups[group].length}</span></div>
              {sortTasks(groups[group], {}).map((task) => (
                <div className="timeline-task-label" key={task.id}>
                  <span className={`task-dot ${phaseClass[task.currentPhase]}`} />
                  <span>{task.title}</span>
                  {task.qaReworkCount > 0 && <strong>{task.qaReworkCount}x</strong>}
                </div>
              ))}
            </div>
          ))}
        </div>

        <div className="timeline-body" ref={bodyRef} onScroll={syncHeader}>
          <div className="timeline-grid" style={{ width: range.totalDays * dayWidth }}>
            <div className="timeline-bg">
              {days.map((day, index) => (
                <div className={`timeline-bg-day ${day === today ? "today-line" : ""} ${isWeekend(day) ? "weekend" : ""}`} style={{ left: index * dayWidth }} key={day} />
              ))}
            </div>
            {groupNames.map((group) => (
              <div key={group}>
                <div className="timeline-group-bar" />
                {sortTasks(groups[group], {}).map((task) => (
                  <div className="timeline-task-row" key={task.id}>
                    {task.phases.map((phase, index) => {
                      const phaseEnd = phase.end ?? today;
                      const clampStart = phase.start < range.start ? range.start : phase.start;
                      const rangeEnd = addDays(range.start, range.totalDays);
                      const clampEnd = phaseEnd > rangeEnd ? rangeEnd : phaseEnd;
                      if (clampStart >= rangeEnd || clampEnd <= range.start) return null;
                      const left = daysBetween(range.start, clampStart) * dayWidth;
                      const width = Math.max(daysBetween(clampStart, clampEnd), 1) * dayWidth - 3;
                      return (
                        <div
                          className={`timeline-segment ${phaseClass[phase.type]} ${task.etaStatus === "overdue" ? "overdue-outline" : ""}`}
                          style={{ left, width }}
                          title={`${task.title}: ${phaseLabels[phase.type]} ${formatShort(phase.start)} - ${phase.end ? formatShort(phase.end) : "ongoing"}`}
                          key={`${task.id}-${phase.type}-${phase.start}-${index}`}
                        >
                          {width > 92 ? phaseLabels[phase.type] : ""}
                        </div>
                      );
                    })}
                    {task.eta && (
                      <div className={`eta-marker ${task.etaStatus === "overdue" ? "missed" : ""}`} style={{ left: daysBetween(range.start, task.eta) * dayWidth + dayWidth / 2 }} title={`ETA ${formatShort(task.eta)}`} />
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
