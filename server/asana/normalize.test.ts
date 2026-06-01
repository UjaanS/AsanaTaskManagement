import { describe, expect, it } from "vitest";
import type { AsanaServerConfig } from "./config";
import { normalizeAsanaTask, normalizeAsanaTasks } from "./normalize";
import type { AsanaTaskWithContext } from "./types";

const config: AsanaServerConfig = {
  accessToken: "test-token",
  projectGids: ["p1"],
  syncLookbackDays: 30,
  fieldMap: {
    p1: {
      status: "status-gid",
      priority: "priority-gid",
      requestType: "type-gid",
      eta: "eta-gid",
      qaState: "qa-gid",
      statusFieldName: "Status",
    },
  },
  projectNames: { p1: "Payment Gateway" },
};

const taskContext: AsanaTaskWithContext = {
  projectGid: "p1",
  projectName: "Payment Gateway",
  task: {
    gid: "120",
    name: "Fix payment callback",
    assignee: { gid: "u1", name: "Ravi" },
    projects: [{ gid: "p1", name: "Payment Gateway" }],
    created_at: "2026-05-01T10:00:00.000Z",
    modified_at: "2026-05-27T10:00:00.000Z",
    due_on: "2026-05-30",
    completed: false,
    custom_fields: [
      { gid: "status-gid", name: "Status", enum_value: { name: "In Dev" }, display_value: "In Dev" },
      { gid: "priority-gid", name: "Priority", enum_value: { name: "High" }, display_value: "High" },
      { gid: "type-gid", name: "Request Type", enum_value: { name: "Bug" }, display_value: "Bug" },
      { gid: "eta-gid", name: "ETA", date_value: { date: "2026-05-29" }, display_value: "2026-05-29" },
      { gid: "qa-gid", name: "QA State", enum_value: { name: "Ready For QA" }, display_value: "Ready For QA" },
    ],
    permalink_url: "https://app.asana.com/0/p1/120",
  },
  stories: [
    {
      gid: "s1",
      text: "changed Status from \"In Dev\" to \"Ready For QA\"",
      resource_subtype: "enum_custom_field_changed",
      created_at: "2026-05-26T10:00:00.000Z",
      created_by: { gid: "u2", name: "Priya" },
    },
    {
      gid: "s2",
      text: "QA passed basic callback checks",
      resource_subtype: "comment_added",
      created_at: "2026-05-27T10:00:00.000Z",
      created_by: { gid: "u2", name: "Priya" },
    },
  ],
};

describe("Asana normalization", () => {
  it("maps configured custom fields into the internal task model", () => {
    const task = normalizeAsanaTask(taskContext, config, "2026-05-28");

    expect(task).toMatchObject({
      id: "120",
      title: "Fix payment callback",
      asanaUrl: "https://app.asana.com/0/p1/120",
      project: "Payment Gateway",
      projectGid: "p1",
      assignee: "Ravi",
      assigneeGid: "u1",
      status: "In Dev",
      priority: "High",
      requestType: "Bug",
      qaState: "Ready For QA",
      eta: "2026-05-29",
      // qaState overrides status when in a QA family — Ready For QA is verbatim.
      phase: "Ready For QA",
    });
    expect(task.comments[0].body).toContain("QA passed");
    expect(task.phases.some((phase) => phase.type === "Ready For QA")).toBe(true);
  });

  it("falls back safely when custom fields are missing", () => {
    const task = normalizeAsanaTask(
      {
        ...taskContext,
        task: {
          ...taskContext.task,
          custom_fields: [],
          due_on: "2026-06-01",
        },
      },
      config,
      "2026-05-28",
    );

    expect(task.status).toBeNull();
    expect(task.priority).toBe("Medium");
    expect(task.requestType).toBe("Unknown");
    expect(task.eta).toBe("2026-06-01");
  });

  it("detects common field names when project-specific mappings are absent", () => {
    const task = normalizeAsanaTask(
      taskContext,
      {
        ...config,
        fieldMap: {},
      },
      "2026-05-28",
    );

    expect(task.status).toBe("In Dev");
    expect(task.priority).toBe("High");
    expect(task.requestType).toBe("Bug");
    expect(task.eta).toBe("2026-05-29");
    expect(task.qaState).toBe("Ready For QA");
  });

  it("filters tasks by AOCC runtime inclusion rules", () => {
    const hidden = normalizeAsanaTasks(
      [
        {
          ...taskContext,
          task: {
            ...taskContext.task,
            gid: "old",
            created_at: "2026-02-01T10:00:00.000Z",
            modified_at: "2026-03-01T10:00:00.000Z",
          },
          stories: [],
        },
      ],
      config,
      "2026-05-28",
    );

    expect(hidden).toHaveLength(0);
  });

  it("includes old tasks when a recent assignment story is available", () => {
    const included = normalizeAsanaTasks(
      [
        {
          ...taskContext,
          task: {
            ...taskContext.task,
            gid: "reassigned",
            created_at: "2026-02-01T10:00:00.000Z",
            modified_at: "2026-03-01T10:00:00.000Z",
          },
          stories: [
            {
              gid: "assigned-story",
              text: "assigned to Ravi",
              resource_subtype: "assigned",
              created_at: "2026-05-20T10:00:00.000Z",
              created_by: { gid: "u2", name: "Nam" },
            },
          ],
        },
      ],
      config,
      "2026-05-28",
    );

    expect(included).toHaveLength(1);
    expect(included[0].recentlyReassigned).toBe(true);
  });
});
