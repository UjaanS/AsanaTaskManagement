import { fetchWorkspaceProjects, fetchWorkspaces } from "./client";
import type { AsanaServerConfig } from "./config";
import { AsanaConfigError, normalizeConfiguredValue, readAsanaEnv } from "./config";

// Cap auto-discovered projects so first-time users with huge workspaces don't
// hang while the dashboard tries to fetch every project's tasks + stories.
// Set ASANA_PROJECT_GIDS in .env to override / pick specific projects.
const AUTO_PROJECT_LIMIT = 25;

export async function buildSessionAsanaConfig(
  accessToken: string,
  workspaceGid: string | null | undefined,
  env: NodeJS.ProcessEnv = process.env,
): Promise<AsanaServerConfig> {
  const snapshot = readAsanaEnv(env);
  if (snapshot.warnings.length > 0) {
    throw new AsanaConfigError(snapshot.warnings[0]);
  }

  const baseConfig: AsanaServerConfig = {
    accessToken,
    workspaceGid: normalizeConfiguredValue(workspaceGid) ?? snapshot.workspaceGid,
    projectGids: snapshot.projectGids,
    syncLookbackDays: snapshot.syncLookbackDays,
    fieldMap: snapshot.fieldMap,
    projectNames: snapshot.projectNames,
  };

  const resolvedWorkspaceGid = baseConfig.workspaceGid ?? (await fetchWorkspaces(baseConfig))[0]?.gid;
  if (!resolvedWorkspaceGid) {
    throw new AsanaConfigError("No Asana workspace is available for this PAT.");
  }

  const discoveredProjects = baseConfig.projectGids.length === 0
    ? (await fetchWorkspaceProjects(resolvedWorkspaceGid, baseConfig)).slice(0, AUTO_PROJECT_LIMIT)
    : [];
  const projectGids = baseConfig.projectGids.length > 0 ? baseConfig.projectGids : discoveredProjects.map((project) => project.gid);
  if (projectGids.length === 0) {
    throw new AsanaConfigError("No Asana projects are available in the connected workspace.");
  }

  return {
    ...baseConfig,
    workspaceGid: resolvedWorkspaceGid,
    projectGids,
    projectNames: {
      ...Object.fromEntries(discoveredProjects.map((project) => [project.gid, project.name ?? project.gid])),
      ...snapshot.projectNames,
    },
  };
}
