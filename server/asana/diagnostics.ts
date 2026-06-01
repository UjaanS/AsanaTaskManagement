import { AsanaApiError, fetchProject, fetchProjectCustomFieldSettings, fetchProjectTaskSample } from "./client";
import { readAsanaEnv, type AsanaFieldMap, type AsanaServerConfig } from "./config";
import { fieldNameFallbacks } from "./normalize";
import type { AsanaCustomField } from "./types";

type MappingKey = "status" | "priority" | "requestType" | "eta" | "qaState";

const mappingKeys: MappingKey[] = ["status", "priority", "requestType", "eta", "qaState"];
const expectedTypes: Record<MappingKey, string[]> = {
  status: ["enum", "text"],
  priority: ["enum", "text"],
  requestType: ["enum", "text"],
  eta: ["date", "text"],
  qaState: ["enum", "text"],
};

export interface AsanaDiagnostics {
  tokenPresent: boolean;
  workspaceGidPresent: boolean;
  configuredProjectGids: string[];
  syncLookbackDays: number;
  currentMappings: Record<string, AsanaFieldMap>;
  projects: ProjectDiagnostic[];
  warnings: string[];
  errors: string[];
}

export interface ProjectDiagnostic {
  gid: string;
  name: string | null;
  connected: boolean;
  customFields: DiagnosticField[];
  configuredMapping: AsanaFieldMap;
  detectedMapping: Record<MappingKey, string | null>;
  missingRecommendedMappings: MappingKey[];
  mappingWarnings: string[];
  sampleTaskCount: number;
  error?: string;
}

export interface DiagnosticField {
  gid: string;
  name: string;
  type: string;
  enumOptions?: { gid: string; name: string }[];
}

export async function buildAsanaDiagnostics(env: NodeJS.ProcessEnv = process.env): Promise<AsanaDiagnostics> {
  const snapshot = readAsanaEnv(env);
  const warnings = [...snapshot.warnings];
  const errors: string[] = [];

  if (!snapshot.accessTokenPresent) errors.push("Missing ASANA_ACCESS_TOKEN. Add it to local .env server-side.");
  if (!snapshot.workspaceGid) warnings.push("Missing ASANA_WORKSPACE_GID. Add it to .env for clearer workspace validation.");
  if (snapshot.projectGids.length === 0) errors.push("Missing ASANA_PROJECT_GIDS. Add one or more comma-separated project GIDs.");

  const diagnostics: AsanaDiagnostics = {
    tokenPresent: snapshot.accessTokenPresent,
    workspaceGidPresent: Boolean(snapshot.workspaceGid),
    configuredProjectGids: snapshot.projectGids,
    syncLookbackDays: snapshot.syncLookbackDays,
    currentMappings: snapshot.fieldMap,
    projects: [],
    warnings,
    errors,
  };

  if (!snapshot.accessTokenPresent || snapshot.projectGids.length === 0) return diagnostics;

  const config: AsanaServerConfig = {
    accessToken: env.ASANA_ACCESS_TOKEN ?? "",
    workspaceGid: snapshot.workspaceGid,
    projectGids: snapshot.projectGids,
    syncLookbackDays: snapshot.syncLookbackDays,
    fieldMap: snapshot.fieldMap,
    projectNames: snapshot.projectNames,
  };

  diagnostics.projects = await Promise.all(snapshot.projectGids.map((projectGid) => diagnoseProject(projectGid, config)));
  diagnostics.warnings.push(...diagnostics.projects.flatMap((project) => project.mappingWarnings.map((warning) => `${project.gid}: ${warning}`)));
  diagnostics.errors.push(...diagnostics.projects.filter((project) => project.error).map((project) => `${project.gid}: ${project.error}`));

  return diagnostics;
}

async function diagnoseProject(projectGid: string, config: AsanaServerConfig): Promise<ProjectDiagnostic> {
  const configuredMapping = config.fieldMap[projectGid] ?? {};
  try {
    const [project, settings, samples] = await Promise.all([
      fetchProject(projectGid, config),
      fetchProjectCustomFieldSettings(projectGid, config),
      fetchProjectTaskSample(projectGid, config, 10),
    ]);

    const fields = settings.flatMap((setting) => setting.custom_field ? [setting.custom_field] : []);
    const customFields = fields.map(toDiagnosticField);
    const detectedMapping = detectMappings(fields);
    const mappingWarnings = validateMappings(configuredMapping, fields, detectedMapping);

    return {
      gid: projectGid,
      name: config.projectNames[projectGid] ?? project.name ?? null,
      connected: true,
      customFields,
      configuredMapping,
      detectedMapping,
      missingRecommendedMappings: mappingKeys.filter((key) => !configuredMapping[key] && !detectedMapping[key]),
      mappingWarnings,
      sampleTaskCount: samples.length,
    };
  } catch (error) {
    return {
      gid: projectGid,
      name: config.projectNames[projectGid] ?? null,
      connected: false,
      customFields: [],
      configuredMapping,
      detectedMapping: emptyDetectedMapping(),
      missingRecommendedMappings: mappingKeys,
      mappingWarnings: [],
      sampleTaskCount: 0,
      error: safeDiagnosticError(error),
    };
  }
}

function detectMappings(fields: AsanaCustomField[]): Record<MappingKey, string | null> {
  return Object.fromEntries(
    mappingKeys.map((key) => {
      const field = fields.find((item) => fieldNameFallbacks[key].includes((item.name ?? "").trim().toLowerCase()));
      return [key, field?.gid ?? null];
    }),
  ) as Record<MappingKey, string | null>;
}

export function validateMappings(
  configuredMapping: AsanaFieldMap,
  fields: AsanaCustomField[],
  detectedMapping: Record<MappingKey, string | null> = detectMappings(fields),
): string[] {
  const warnings: string[] = [];

  for (const key of mappingKeys) {
    const configuredGid = configuredMapping[key];
    if (!configuredGid) {
      warnings.push(detectedMapping[key] ? `${key} is using fallback field-name detection.` : `${key} mapping is missing and no fallback field was detected.`);
      continue;
    }

    const field = fields.find((item) => item.gid === configuredGid);
    if (!field) {
      warnings.push(`${key} mapping points to unknown custom field gid ${configuredGid}.`);
      continue;
    }

    const type = field.type ?? "unknown";
    if (!expectedTypes[key].includes(type)) {
      warnings.push(`${key} mapping uses field "${field.name ?? configuredGid}" with type ${type}; expected ${expectedTypes[key].join(" or ")}.`);
    }
  }

  return warnings;
}

function toDiagnosticField(field: AsanaCustomField): DiagnosticField {
  return {
    gid: field.gid,
    name: field.name ?? "Unnamed field",
    type: field.type ?? "unknown",
    enumOptions: field.enum_options?.map((option) => ({ gid: option.gid, name: option.name ?? "Unnamed option" })),
  };
}

function emptyDetectedMapping(): Record<MappingKey, string | null> {
  return { status: null, priority: null, requestType: null, eta: null, qaState: null };
}

function safeDiagnosticError(error: unknown): string {
  if (error instanceof AsanaApiError) return error.safeMessage;
  return error instanceof Error ? error.message : "Unable to inspect Asana project.";
}
