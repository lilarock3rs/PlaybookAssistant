import { ClickUpClient } from './clickup';
import { config } from '../config';
import { logger } from '../utils/logger';

export class ClickUpPlaybookManager extends ClickUpClient {
  
  async getPlaybookTasks(options: {
    includeCompleted?: boolean;
    limit?: number;
  } = {}): Promise<any[]> {
    const { includeCompleted = false, limit = 100 } = options;
    
    logger.info('Fetching playbook tasks', { 
      folderId: config.clickup.playbooksFolderId,
      workspaceId: config.clickup.workspaceId,
      includeCompleted,
      limit 
    });

    try {
      if (config.clickup.playbooksFolderId) {
        // Use specific playbooks folder
        return await this.getTasks({
          folderId: config.clickup.playbooksFolderId,
          includeCompleted,
          limit,
        });
      } else if (config.clickup.spaceId) {
        // Fallback to space
        return await this.getTasks({
          spaceId: config.clickup.spaceId,
          includeCompleted,
          limit,
        });
      } else {
        // Auto-discover from workspace
        return await this.autoDiscoverPlaybooks({ includeCompleted, limit });
      }
    } catch (error) {
      logger.error('Error fetching playbook tasks:', error as Error);
      throw error;
    }
  }

  async searchPlaybookTasks(query: string, limit: number = 50): Promise<any[]> {
    logger.info('Searching playbook tasks', { 
      query,
      folderId: config.clickup.playbooksFolderId,
      limit 
    });

    try {
      if (config.clickup.playbooksFolderId) {
        return await this.searchTasks(query, {
          folderId: config.clickup.playbooksFolderId,
          limit,
        });
      } else if (config.clickup.spaceId) {
        return await this.searchTasks(query, {
          spaceId: config.clickup.spaceId,
          limit,
        });
      } else {
        return await this.searchTasks(query, { limit });
      }
    } catch (error) {
      logger.error('Error searching playbook tasks:', error as Error);
      throw error;
    }
  }

  private async autoDiscoverPlaybooks(options: {
    includeCompleted: boolean;
    limit: number;
  }): Promise<any[]> {
    logger.info('Auto-discovering playbooks from workspace');

    try {
      // Get all teams
      const teams = await this.getTeams();
      if (teams.length === 0) {
        throw new Error('No teams found in workspace');
      }

      // Get all spaces from first team
      const spaces = await this.getSpaces(teams[0].id);
      if (spaces.length === 0) {
        throw new Error('No spaces found in team');
      }

      let allTasks: any[] = [];

      // Search through spaces looking for playbook-related content
      for (const space of spaces) {
        try {
          const tasks = await this.getTasks({
            spaceId: space.id,
            includeCompleted: options.includeCompleted,
            limit: Math.min(options.limit, 50), // Limit per space
          });

          // Filter tasks that might be playbooks
          const playbookTasks = tasks.filter(task => 
            this.isLikelyPlaybook(task)
          );

          allTasks = allTasks.concat(playbookTasks);

          if (allTasks.length >= options.limit) {
            break;
          }
        } catch (error) {
          logger.warn(`Error fetching tasks from space ${space.name}:`, error as Error);
          continue;
        }
      }

      logger.info(`Auto-discovered ${allTasks.length} potential playbook tasks`);
      return allTasks.slice(0, options.limit);
    } catch (error) {
      logger.error('Error in auto-discovery:', error as Error);
      throw error;
    }
  }

  private isLikelyPlaybook(task: any): boolean {
    const playbookKeywords = [
      'playbook', 'process', 'guide', 'procedure', 'workflow', 'manual',
      'documentation', 'instruction', 'template', 'best practice', 'sop',
      'standard operating procedure', 'how to', 'step by step'
    ];

    const title = task.name.toLowerCase();
    const description = (task.description || '').toLowerCase();
    const content = `${title} ${description}`;

    return playbookKeywords.some(keyword => 
      content.includes(keyword)
    );
  }

  async getFolderInfo(folderId?: string): Promise<any> {
    try {
      const targetFolderId = folderId || config.clickup.playbooksFolderId;
      if (!targetFolderId) {
        throw new Error('No folder ID provided');
      }

      const response = await fetch(`${this.getApiBase()}/folder/${targetFolderId}`, {
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        throw new Error(`ClickUp API error: ${response.status} ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      logger.error('Error fetching folder info:', error as Error);
      throw error;
    }
  }

  async getWorkspaceInfo(): Promise<any> {
    try {
      if (!config.clickup.workspaceId) {
        logger.warn('No workspace ID configured, using teams endpoint');
        return await this.getTeams();
      }

      // ClickUp API doesn't have a direct workspace endpoint
      // We'll get team info instead
      const teams = await this.getTeams();
      const workspaceTeam = teams.find(team => 
        team.id === config.clickup.workspaceId
      );

      return workspaceTeam || teams[0];
    } catch (error) {
      logger.error('Error fetching workspace info:', error as Error);
      throw error;
    }
  }

  private getApiBase(): string {
    return 'https://api.clickup.com/api/v2';
  }

  private getHeaders(): Record<string, string> {
    return {
      'Authorization': config.clickup.apiKey,
      'Content-Type': 'application/json',
    };
  }
}

export const clickupPlaybookManager = new ClickUpPlaybookManager();