import { useCallback, useEffect, useMemo, useState } from "react";
import { AssigneeDashboard } from "./components/AssigneeDashboard";
import { AttentionPanel } from "./components/AttentionPanel";
import { EODModal } from "./components/EODModal";
import { FilterBar } from "./components/FilterBar";
import { OpsSnapshot } from "./components/OpsSnapshot";
import { SettingsPanel } from "./components/SettingsPanel";
import { StatsBar } from "./components/StatsBar";
import { TimelineView } from "./components/TimelineView";
import {
  getConnectionStatus,
  getOpsSummary,
  getProjectHealth,
  getUserWorkloads,
  opsDataSource,
  runSync,
  saveConnection,
} from "./data/opsDataSource";
import { applyFilters, deriveTasks } from "./lib/ops";
import type { ConnectionStatus, Filters, OpsSummary, OpsTask, ProjectHealth, UserWorkload, ViewKey } from "./types/ops";

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
  const [tasks, setTasks] = useState<OpsTask[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus | null>(null);
  const [summary, setSummary] = useState<OpsSummary | null>(null);
  const [projects, setProjects] = useState<ProjectHealth[]>([]);
  const [workloads, setWorkloads] = useState<UserWorkload[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    setIsLoading(true);
    try {
      const nextTasks = await opsDataSource.listTasks();
      setTasks(nextTasks);
      setLoadError(null);
    } catch (error: unknown) {
      setLoadError(error instanceof Error ? error.message : "Unable to load AOCC tasks.");
    } finally {
      setIsLoading(false);
    }

    const settled = await Promise.allSettled([
      getConnectionStatus(),
      getOpsSummary(),
      getProjectHealth(),
      getUserWorkloads(),
    ]);
    if (settled[0].status === "fulfilled") setConnectionStatus(settled[0].value);
    if (settled[1].status === "fulfilled") setSummary(settled[1].value);
    if (settled[2].status === "fulfilled") setProjects(settled[2].value);
    if (settled[3].status === "fulfilled") setWorkloads(settled[3].value);
  }, []);

  useEffect(() => {
    let active = true;
    loadDashboard().finally(() => {
      if (!active) return;
    });
    return () => {
      active = false;
    };
  }, [loadDashboard]);

  async function handleSaveConnection(pat: string, workspaceGid: string) {
    await saveConnection(pat, workspaceGid);
    setConnectionStatus(await getConnectionStatus());
  }

  async function handleRunSync() {
    setIsSyncing(true);
    setSyncMessage(null);
    try {
      const result = await runSync();
      setSyncMessage(result.taskCount === undefined ? "Sync completed." : `Sync completed with ${result.taskCount} tasks.`);
      await loadDashboard();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to sync Asana data.";
      setSyncMessage(message);
      throw error;
    } finally {
      setIsSyncing(false);
    }
  }

  const derivedTasks = useMemo(() => deriveTasks(tasks), [tasks]);
  const filteredTasks = useMemo(() => applyFilters(derivedTasks, filters, showOld), [derivedTasks, filters, showOld]);

  return (
    <div className={`app ${isDark ? "theme-dark" : "theme-light"}`}>
      <header className="topbar">
        <div className="brand-block">
          <strong>AOCC</strong>
          <span>ASANA OPERATIONS COMMAND CENTER</span>
          <em>LIVE ASANA</em>
        </div>

        <nav className="main-tabs" aria-label="Dashboard views">
          <Tab active={view === "assignee"} onClick={() => setView("assignee")}>Assignees</Tab>
          <Tab active={view === "timeline"} onClick={() => setView("timeline")}>Timeline</Tab>
          <Tab active={view === "attention"} onClick={() => setView("attention")}>Attention</Tab>
          <Tab active={view === "settings"} onClick={() => setView("settings")}>Settings</Tab>
        </nav>

        <div className="topbar-stats">
          <StatsBar tasks={filteredTasks} />
        </div>

        <div className="topbar-actions">
          <button className="button" type="button" disabled={isSyncing} onClick={() => void handleRunSync()}>{isSyncing ? "Syncing" : "Sync"}</button>
          <button className="button" type="button" onClick={() => setIsDark((value) => !value)}>{isDark ? "Light" : "Dark"}</button>
          <button className="button button-accent" type="button" onClick={() => setShowEod(true)}>EOD Report</button>
        </div>
      </header>

      <main className="workspace">
        {view !== "settings" && (
          <FilterBar
            tasks={derivedTasks}
            filters={filters}
            showOld={showOld}
            onFiltersChange={setFilters}
            onShowOldChange={setShowOld}
          />
        )}

        <div className="content-shell">
          {view !== "settings" && <OpsSnapshot summary={summary} projects={projects} workloads={workloads} />}
          {view === "settings" && (
            <SettingsPanel
              status={connectionStatus}
              isSyncing={isSyncing}
              statusMessage={syncMessage}
              onSaveConnection={handleSaveConnection}
              onRunSync={handleRunSync}
            />
          )}
          {view !== "settings" && isLoading && <div className="empty-state">Loading operational task snapshots...</div>}
          {view !== "settings" && loadError && <div className="empty-state error-state">{loadError}</div>}
          {view !== "settings" && !isLoading && !loadError && filteredTasks.length === 0 && (
            <div className="empty-state">No tasks match the current filters. Clear filters or enable Show Old.</div>
          )}
          {!isLoading && !loadError && filteredTasks.length > 0 && view === "assignee" && (
            <AssigneeDashboard tasks={filteredTasks} order={order} onOrderChange={setOrder} />
          )}
          {!isLoading && !loadError && filteredTasks.length > 0 && view === "timeline" && <TimelineView tasks={filteredTasks} />}
          {!isLoading && !loadError && filteredTasks.length > 0 && view === "attention" && <AttentionPanel tasks={filteredTasks} />}
        </div>
      </main>

      <footer className="footer">
        Persisted Asana data. Drag rows inside an assignee to adjust local priority order for this session. Show Old reveals hidden legacy work.
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
