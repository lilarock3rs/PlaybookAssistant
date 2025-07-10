import { Config } from '../types';

export const config: Config = {
  slack: {
    botToken: process.env.SLACK_BOT_TOKEN || '',
    signingSecret: process.env.SLACK_SIGNING_SECRET || '',
  },
  clickup: {
    apiKey: process.env.CLICKUP_API_KEY || '',
    workspaceId: process.env.CLICKUP_WORKSPACE_ID,
    playbooksFolderId: process.env.CLICKUP_PLAYBOOKS_FOLDER_ID,
    teamId: process.env.CLICKUP_TEAM_ID,
    spaceId: process.env.CLICKUP_SPACE_ID,
  },
  google: {
    apiKey: process.env.GOOGLE_API_KEY || '',
  },
  database: {
    url: process.env.DATABASE_URL || '',
    ssl: process.env.NODE_ENV === 'production',
  },
  ai: {
    embeddingModel: 'models/embedding-001',
    maxTokens: 1000,
    temperature: 0.7,
  },
};

export const validateConfig = (): { valid: boolean; missing: string[] } => {
  const missing: string[] = [];
  
  if (!config.slack.botToken) missing.push('SLACK_BOT_TOKEN');
  if (!config.slack.signingSecret) missing.push('SLACK_SIGNING_SECRET');
  if (!config.clickup.apiKey) missing.push('CLICKUP_API_KEY');
  if (!config.google.apiKey) missing.push('GOOGLE_API_KEY');
  if (!config.database.url) missing.push('DATABASE_URL');
  
  return {
    valid: missing.length === 0,
    missing,
  };
};