import fetch from 'node-fetch';
import { config } from '../config';
import { ClickUpTask } from '../types';

const CLICKUP_API_BASE = 'https://api.clickup.com/api/v2';

export class ClickUpClient {
  private apiKey: string;
  private headers: Record<string, string>;

  constructor() {
    this.apiKey = config.clickup.apiKey;
    this.headers = {
      'Authorization': this.apiKey,
      'Content-Type': 'application/json',
    };
  }

  async getTasks(params: {
    spaceId?: string;
    listId?: string;
    folderId?: string;
    includeCompleted?: boolean;
    limit?: number;
  } = {}): Promise<ClickUpTask[]> {
    try {
      const { spaceId, listId, folderId, includeCompleted = false, limit = 100 } = params;
      
      let url = '';
      if (listId) {
        url = `${CLICKUP_API_BASE}/list/${listId}/task`;
      } else if (folderId) {
        url = `${CLICKUP_API_BASE}/folder/${folderId}/task`;
      } else if (spaceId) {
        url = `${CLICKUP_API_BASE}/space/${spaceId}/task`;
      } else if (config.clickup.playbooksFolderId) {
        url = `${CLICKUP_API_BASE}/folder/${config.clickup.playbooksFolderId}/task`;
      } else if (config.clickup.spaceId) {
        url = `${CLICKUP_API_BASE}/space/${config.clickup.spaceId}/task`;
      } else {
        const teams = await this.getTeams();
        if (teams.length === 0) {
          throw new Error('No teams found');
        }
        const spaces = await this.getSpaces(teams[0].id);
        if (spaces.length === 0) {
          throw new Error('No spaces found');
        }
        url = `${CLICKUP_API_BASE}/space/${spaces[0].id}/task`;
      }

      const queryParams = new URLSearchParams({
        limit: limit.toString(),
        include_completed: includeCompleted.toString(),
      });

      const response = await fetch(`${url}?${queryParams}`, {
        headers: this.headers,
      });

      if (!response.ok) {
        throw new Error(`ClickUp API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json() as any;
      return data.tasks || [];
    } catch (error) {
      console.error('Error fetching ClickUp tasks:', error);
      throw error;
    }
  }

  async getTask(taskId: string): Promise<ClickUpTask | null> {
    try {
      const response = await fetch(`${CLICKUP_API_BASE}/task/${taskId}`, {
        headers: this.headers,
      });

      if (!response.ok) {
        if (response.status === 404) {
          return null;
        }
        throw new Error(`ClickUp API error: ${response.status} ${response.statusText}`);
      }

      return await response.json() as ClickUpTask;
    } catch (error) {
      console.error('Error fetching ClickUp task:', error);
      throw error;
    }
  }

  async getTeams(): Promise<Array<{ id: string; name: string }>> {
    try {
      const response = await fetch(`${CLICKUP_API_BASE}/team`, {
        headers: this.headers,
      });

      if (!response.ok) {
        throw new Error(`ClickUp API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json() as any;
      return data.teams || [];
    } catch (error) {
      console.error('Error fetching ClickUp teams:', error);
      throw error;
    }
  }

  async getSpaces(teamId: string): Promise<Array<{ id: string; name: string }>> {
    try {
      const response = await fetch(`${CLICKUP_API_BASE}/team/${teamId}/space`, {
        headers: this.headers,
      });

      if (!response.ok) {
        throw new Error(`ClickUp API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json() as any;
      return data.spaces || [];
    } catch (error) {
      console.error('Error fetching ClickUp spaces:', error);
      throw error;
    }
  }

  async searchTasks(query: string, params: {
    spaceId?: string;
    folderId?: string;
    limit?: number;
  } = {}): Promise<ClickUpTask[]> {
    try {
      const { spaceId, folderId, limit = 50 } = params;
      
      let url = '';
      if (folderId) {
        url = `${CLICKUP_API_BASE}/folder/${folderId}/task`;
      } else if (spaceId) {
        url = `${CLICKUP_API_BASE}/space/${spaceId}/task`;
      } else if (config.clickup.playbooksFolderId) {
        url = `${CLICKUP_API_BASE}/folder/${config.clickup.playbooksFolderId}/task`;
      } else if (config.clickup.spaceId) {
        url = `${CLICKUP_API_BASE}/space/${config.clickup.spaceId}/task`;
      } else {
        const teams = await this.getTeams();
        if (teams.length === 0) {
          throw new Error('No teams found');
        }
        const spaces = await this.getSpaces(teams[0].id);
        if (spaces.length === 0) {
          throw new Error('No spaces found');
        }
        url = `${CLICKUP_API_BASE}/space/${spaces[0].id}/task`;
      }

      const queryParams = new URLSearchParams({
        limit: limit.toString(),
        query,
      });

      const response = await fetch(`${url}?${queryParams}`, {
        headers: this.headers,
      });

      if (!response.ok) {
        throw new Error(`ClickUp API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json() as any;
      return data.tasks || [];
    } catch (error) {
      console.error('Error searching ClickUp tasks:', error);
      throw error;
    }
  }
}