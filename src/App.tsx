import { useMemo, useState } from "react";
import { AssigneeDashboard } from "./components/AssigneeDashboard";
import { AttentionPanel } from "./components/AttentionPanel";
import { EODModal } from "./components/EODModal";
import { FilterBar } from "./components/FilterBar";
import { StatsBar } from "./components/StatsBar";
import { TimelineView } from "./components/TimelineView";
import { mockTasks } from "./data/mockTasks";
import { applyFilters, deriveTasks } from "./lib/ops";
import type { Filters, ViewKey } from "./types/ops";

const initialFilters: Filters = {
  assignee: "",
  project: "",
  priority: "",
  phase: "",
  requestType: "",
  flag: "",
  query: "",
};

export default function App() {
  const prefersDark = typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
  const [isDark, setIsDark] = useState(prefersDark);
  const [view, setView] = useState<ViewKey>("assignee");
  const [showOld, setShowOld] = useState(false);
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [showEod, setShowEod] = useState(false);
  const [order, setOrder] = useState<Record<string, number>>({});

  const derivedTasks = useMemo(() => deriveTasks(mockTasks), []);
  const filteredTasks = useMemo(() => applyFilters(derivedTasks, filters, showOld), [derivedTasks, filters, showOld]);

  return (
    <div className={`app ${isDark ? "theme-dark" : "theme-light"}`}>
      <header className="topbar">
        <div className="brand-block">
          <strong>AOCC</strong>
          <span>ASANA OPERATIONS COMMAND CENTER</span>
          <em>MOCK V1</em>
        </div>

        <nav className="main-tabs" aria-label="Dashboard views">
          <Tab active={view === "assignee"} onClick={() => setView("assignee")}>Assignees</Tab>
          <Tab active={view === "timeline"} onClick={() => setView("timeline")}>Timeline</Tab>
          <Tab active={view === "attention"} onClick={() => setView("attention")}>Attention</Tab>
        </nav>

        <div className="topbar-stats">
          <StatsBar tasks={filteredTasks} />
        </div>

        <div className="topbar-actions">
          <button className="button" type="button" onClick={() => setIsDark((value) => !value)}>{isDark ? "Light" : "Dark"}</button>
          <button className="button button-accent" type="button" onClick={() => setShowEod(true)}>EOD Report</button>
        </div>
      </header>

      <main className="workspace">
        <FilterBar
          tasks={derivedTasks}
          filters={filters}
          showOld={showOld}
          onFiltersChange={setFilters}
          onShowOldChange={setShowOld}
        />

        <div className="content-shell">
          {view === "assignee" && <AssigneeDashboard tasks={filteredTasks} order={order} onOrderChange={setOrder} />}
          {view === "timeline" && <TimelineView tasks={filteredTasks} />}
          {view === "attention" && <AttentionPanel tasks={filteredTasks} />}
        </div>
      </main>

      <footer className="footer">
        Mock data only. Drag rows inside an assignee to adjust local priority order. Show Old reveals hidden legacy work.
      </footer>

      {showEod && <EODModal tasks={filteredTasks} onClose={() => setShowEod(false)} />}
    </div>
  );
}

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button className={active ? "active" : ""} type="button" onClick={onClick}>
      {children}
    </button>
  );
}
