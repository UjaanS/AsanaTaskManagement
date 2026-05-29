export interface AsanaNamedResource {
  gid: string;
  name?: string;
}

export interface AsanaCustomField {
  gid: string;
  name?: string;
  type?: string;
  display_value?: string | null;
  text_value?: string | null;
  number_value?: number | null;
  date_value?: { date?: string | null; date_time?: string | null } | null;
  enum_value?: { gid?: string; name?: string } | null;
  enum_options?: { gid: string; name?: string; enabled?: boolean }[];
}

export interface AsanaTask {
  gid: string;
  name: string;
  assignee?: AsanaNamedResource | null;
  projects?: AsanaNamedResource[];
  created_at: string;
  modified_at: string;
  due_on?: string | null;
  due_at?: string | null;
  completed?: boolean;
  completed_at?: string | null;
  custom_fields?: AsanaCustomField[];
  permalink_url?: string;
}

export interface AsanaStory {
  gid: string;
  text?: string;
  resource_subtype?: string;
  created_at: string;
  created_by?: AsanaNamedResource | null;
}

export interface AsanaTaskWithContext {
  task: AsanaTask;
  projectGid: string;
  projectName: string;
  stories: AsanaStory[];
}

export interface AsanaProject {
  gid: string;
  name?: string;
}

export interface AsanaCustomFieldSetting {
  gid: string;
  custom_field?: AsanaCustomField | null;
}
