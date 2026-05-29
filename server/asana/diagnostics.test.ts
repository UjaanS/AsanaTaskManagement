import { describe, expect, it } from "vitest";
import { buildAsanaDiagnostics, validateMappings } from "./diagnostics";
import type { AsanaCustomField } from "./types";

const fields: AsanaCustomField[] = [
  { gid: "status-gid", name: "Status", type: "enum", enum_options: [{ gid: "open", name: "Open" }] },
  { gid: "priority-gid", name: "Priority", type: "enum", enum_options: [{ gid: "high", name: "High" }] },
  { gid: "type-gid", name: "Request Type", type: "enum", enum_options: [{ gid: "bug", name: "Bug" }] },
  { gid: "eta-gid", name: "ETA", type: "date" },
  { gid: "qa-gid", name: "QA State", type: "enum", enum_options: [{ gid: "failed", name: "QA Failed" }] },
];

describe("Asana diagnostics", () => {
  it("reports missing setup without leaking token values", async () => {
    const diagnostics = await buildAsanaDiagnostics({
      ASANA_ACCESS_TOKEN: "secret-token-should-not-leak",
      ASANA_WORKSPACE_GID: "workspace",
    } as NodeJS.ProcessEnv);

    const serialized = JSON.stringify(diagnostics);
    expect(diagnostics.tokenPresent).toBe(true);
    expect(diagnostics.errors).toContain("Missing ASANA_PROJECT_GIDS. Add one or more comma-separated project GIDs.");
    expect(serialized).not.toContain("secret-token-should-not-leak");
    expect(serialized).not.toContain("ASANA_ACCESS_TOKEN=");
  });

  it("validates invalid field gids and missing recommended mappings", () => {
    const warnings = validateMappings(
      {
        status: "not-a-real-field",
        priority: "priority-gid",
      },
      fields,
    );

    expect(warnings).toContain("status mapping points to unknown custom field gid not-a-real-field.");
    expect(warnings).toContain("requestType is using fallback field-name detection.");
    expect(warnings).toContain("eta is using fallback field-name detection.");
    expect(warnings).toContain("qaState is using fallback field-name detection.");
  });

  it("warns when mapped fields have unexpected types", () => {
    const warnings = validateMappings(
      {
        eta: "status-gid",
      },
      fields,
    );

    expect(warnings).toContain('eta mapping uses field "Status" with type enum; expected date or text.');
  });

  it("surfaces invalid JSON configuration as safe diagnostics", async () => {
    const diagnostics = await buildAsanaDiagnostics({
      ASANA_FIELD_MAP_JSON: "{bad json",
    } as NodeJS.ProcessEnv);

    expect(diagnostics.warnings).toContain("ASANA_FIELD_MAP_JSON is invalid JSON.");
    expect(JSON.stringify(diagnostics)).not.toContain("Bearer");
  });
});
