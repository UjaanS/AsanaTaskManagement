import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AssigneeDashboard } from "./components/AssigneeDashboard";
import { AttentionPanel } from "./components/AttentionPanel";
import { EODModal } from "./components/EODModal";
import { FilterBar } from "./components/FilterBar";
import { OpsSnapshot } from "./components/OpsSnapshot";
import { SettingsPanel } from "./components/SettingsPanel";
import { StatsBar } from "./components/StatsBar";
import { TimelineView } from "./components/TimelineView";
import {
  clearConnection,
  getConnectionStatus,
  opsDataSource,
  saveConnection,
} from "./data/opsDataSource";
import { applyFilters, deriveTasks } from "./lib/ops";
import { opsConfig } from "./lib/opsConfig";
import type { ConnectionStatus, DerivedTask, Filters, OpsSummary, OpsTask, ProjectHealth, UserWorkload, ViewKey } from "./types/ops";

const initialFilters: Filters = {
  assignee: "",
  project: "",
  phase: "",
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
  const [showSettings, setShowSettings] = useState(false);
  const [order, setOrder] = useState<Record<string, number>>({});
  const [tasks, setTasks] = useState<OpsTask[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  // Monotonic fetch token: every loadDashboard call grabs a fresh id, and only
  // applies its result if it's still the latest in-flight call. Prevents a slow
  // stale fetch from clobbering a fresher one when the user toggles rapidly.
  const fetchTokenRef = useRef(0);

  const loadDashboard = useCallback(async (includeOld: boolean) => {
    const myToken = ++fetchTokenRef.current;
    setIsLoading(true);
    try {
      const nextTasks = await opsDataSource.listTasks({ includeOld });
      if (myToken !== fetchTokenRef.current) return; // a newer fetch superseded us
      setTasks(nextTasks);
      setLoadError(null);
    } catch (error: unknown) {
      if (myToken !== fetchTokenRef.current) return;
      setLoadError(error instanceof Error ? error.message : "Unable to load AOCC tasks.");
    } finally {
      if (myToken === fetchTokenRef.current) setIsLoading(false);
    }

    const settled = await Promise.allSettled([getConnectionStatus()]);
    if (myToken !== fetchTokenRef.current) return;
    if (settled[0].status === "fulfilled") setConnectionStatus(settled[0].value);
  }, []);

  // Re-fetch from Asana whenever the archived-tasks toggle flips, so the wire
  // payload reflects the user's intent (and stays small in the default case).
  useEffect(() => {
    void loadDashboard(showOld);
  }, [loadDashboard, showOld]);

  async function handleSaveConnection(pat: string, workspaceGid: string) {
    // The Settings save button should return as soon as the PAT is validated and the
    // session cookie is set. Pulling the full dashboard can take a long time on a
    // fresh workspace (auto-discovered projects + tasks + stories), so fire it in
    // the background and let the dashboard's own loading state communicate progress.
    await saveConnection(pat, workspaceGid);
    setConnectionStatus(await getConnectionStatus());
    void loadDashboard(showOld);
  }

  async function handleClearConnection() {
    await clearConnection();
    setConnectionStatus(await getConnectionStatus());
    setTasks([]);
    setSyncMessage("Asana session cleared.");
  }

  async function handleRunSync() {
    // Sync = re-pull from Asana into the dashboard state. loadDashboard does
    // exactly that, so there is no need to also call runSync separately (which
    // would double the wire payload).
    setIsSyncing(true);
    setSyncMessage(null);
    try {
      await loadDashboard(showOld);
      setSyncMessage("Sync completed.");
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
  const snapshot = useMemo(() => buildSnapshot(derivedTasks), [derivedTasks]);

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
        </nav>

        <div className="topbar-stats">
          <StatsBar tasks={filteredTasks} />
        </div>

        <div className="topbar-actions">
          <button className="button" type="button" disabled={isSyncing} onClick={() => void handleRunSync()}>{isSyncing ? "Syncing" : "Sync"}</button>
          <button className="button" type="button" onClick={() => setShowSettings(true)}>Settings</button>
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
          <OpsSnapshot summary={snapshot.summary} projects={snapshot.projects} workloads={snapshot.workloads} />
          {isLoading && <div className="empty-state">Loading operational task snapshots...</div>}
          {loadError && <div className="empty-state error-state">{loadError}</div>}
          {!isLoading && !loadError && filteredTasks.length === 0 && (
            <div className="empty-state">No tasks match the current filters. Clear filters or enable <em>Include archived tasks</em>.</div>
          )}
          {!isLoading && !loadError && filteredTasks.length > 0 && view === "assignee" && (
            <AssigneeDashboard tasks={filteredTasks} order={order} onOrderChange={setOrder} />
          )}
          {!isLoading && !loadError && filteredTasks.length > 0 && view === "timeline" && <TimelineView tasks={filteredTasks} />}
          {!isLoading && !loadError && filteredTasks.length > 0 && view === "attention" && <AttentionPanel tasks={filteredTasks} />}
        </div>
      </main>

      <footer className="footer">
        Persisted Asana data. Drag rows inside an assignee to adjust local priority order for this session. Default view is the last {opsConfig.recentTaskMonths} months — toggle <em>Include archived tasks</em> for the full history.
      </footer>

      {showEod && <EODModal tasks={filteredTasks} onClose={() => setShowEod(false)} />}
      {showSettings && (
        <SettingsPanel
          status={connectionStatus}
          isSyncing={isSyncing}
          statusMessage={syncMessage}
          onClose={() => setShowSettings(false)}
          onSaveConnection={handleSaveConnection}
          onClearConnection={handleClearConnection}
          onRunSync={handleRunSync}
        />
      )}
    </div>
  );
}

function buildSnapshot(tasks: DerivedTask[]): { summary: OpsSummary; projects: ProjectHealth[]; workloads: UserWorkload[] } {
  const today = new Date().toISOString().slice(0, 10);
  const projectMap = new Map<string, DerivedTask[]>();
  const assigneeMap = new Map<string, DerivedTask[]>();

  tasks.forEach((task) => {
    projectMap.set(task.project, [...(projectMap.get(task.project) ?? []), task]);
    const assignee = task.assignee ?? "Unassigned";
    assigneeMap.set(assignee, [...(assigneeMap.get(assignee) ?? []), task]);
  });

  const projects = [...projectMap.entries()].map(([name, projectTasks]) => {
    const active = projectTasks.filter((task) => !task.completedAt);
    const completed = projectTasks.length - active.length;
    const overdueCount = active.filter((task) => task.etaStatus === "overdue").length;
    const blockerCount = active.filter((task) => opsConfig.isOnHold(task.currentPhase)).length;
    const riskScore = overdueCount * 35 + blockerCount * 30 + active.filter((task) => task.attentionSignals.length > 0).length * 10;
    return {
      id: name,
      name,
      completionPct: projectTasks.length === 0 ? 0 : Number(((completed / projectTasks.length) * 100).toFixed(1)),
      overdueCount,
      blockerCount,
      riskScore,
      healthStatus: riskScore >= 60 ? "red" : riskScore >= 35 ? "yellow" : "green",
      nextDeadline: active.map((task) => task.eta ?? task.dueDate).filter(Boolean).sort()[0] ?? null,
    };
  });

  const workloads = [...assigneeMap.entries()].map(([name, assigneeTasks]) => {
    const active = assigneeTasks.filter((task) => !task.completedAt);
    return {
      name,
      active: active.length,
      overdue: active.filter((task) => task.etaStatus === "overdue").length,
      blocked: active.filter((task) => opsConfig.isOnHold(task.currentPhase)).length,
      stale: active.filter((task) => task.staleDays > 0).length,
      completion: assigneeTasks.length === 0 ? 0 : Number((((assigneeTasks.length - active.length) / assigneeTasks.length) * 100).toFixed(1)),
    };
  });

  return {
    summary: {
      completedToday: tasks.filter((task) => task.completedAt === today).length,
      overdue: tasks.filter((task) => task.etaStatus === "overdue").length,
      newBlockers: tasks.filter((task) => opsConfig.isOnHold(task.currentPhase)).length,
      highRiskProjects: projects.filter((project) => project.healthStatus === "red").length,
      recentActivity: tasks.slice(0, 8).map((task) => ({
        id: task.id,
        type: task.currentPhase,
        title: task.title,
        createdAt: task.modifiedAt,
      })),
    },
    projects,
    workloads,
  };
}

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button className={active ? "active" : ""} type="button" onClick={onClick}>
      {children}
    </button>
  );
}
