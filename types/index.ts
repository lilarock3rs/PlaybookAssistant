export interface Playbook {
  id: string;
  clickup_id: string;
  title: string;
  description: string;
  content: string;
  category: string;
  tags: string[];
  url: string;
  created_at: Date;
  updated_at: Date;
  embedding?: number[];
  similarity_score?: number;
}

export interface PlaybookSearchResult {
  playbook: Playbook;
  similarity_score: number;
  relevance_reason?: string;
}

export interface SearchQuery {
  query: string;
  category?: string;
  limit?: number;
  threshold?: number;
}

export interface ClickUpTask {
  id: string;
  name: string;
  description: string;
  status: {
    status: string;
    color: string;
    type: string;
  };
  url: string;
  tags: Array<{
    name: string;
    tag_fg: string;
    tag_bg: string;
  }>;
  custom_fields: Array<{
    id: string;
    name: string;
    value: any;
  }>;
  list: {
    id: string;
    name: string;
  };
  folder: {
    id: string;
    name: string;
  };
  space: {
    id: string;
    name: string;
  };
  date_created: string;
  date_updated: string;
}

export interface SlackCommandPayload {
  token: string;
  team_id: string;
  team_domain: string;
  channel_id: string;
  channel_name: string;
  user_id: string;
  user_name: string;
  command: string;
  text: string;
  response_url: string;
  trigger_id: string;
}

export interface EmbeddingResponse {
  embedding: number[];
  error?: string;
}

export interface SyncResult {
  success: boolean;
  synced_count: number;
  updated_count: number;
  error_count: number;
  errors?: string[];
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface DatabaseConfig {
  url: string;
  ssl?: boolean;
}

export interface Config {
  slack: {
    botToken: string;
    signingSecret: string;
  };
  clickup: {
    apiKey: string;
    workspaceId?: string;
    playbooksFolderId?: string;
    teamId?: string;
    spaceId?: string;
  };
  google: {
    apiKey: string;
  };
  database: DatabaseConfig;
  ai: {
    embeddingModel: string;
    maxTokens: number;
    temperature: number;
  };
}