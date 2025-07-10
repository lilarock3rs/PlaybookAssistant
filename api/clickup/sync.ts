import { VercelRequest, VercelResponse } from '@vercel/node';
import { ClickUpClient } from '../../lib/clickup';
import { DatabaseClient } from '../../lib/database';
import { GeminiClient } from '../../lib/gemini';
import { ApiResponse, SyncResult } from '../../types';
import { logger } from '../../utils/logger';
import { rateLimiter } from '../../utils/rate-limiter';
import { createSearchableText, extractTextFromHtml, extractSummary } from '../../utils/text-processing';
import { validatePlaybook } from '../../utils/validation';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    res.status(405).json({ success: false, error: 'Method not allowed' });
    return;
  }

  const { force_sync = false, space_id, limit = 100 } = req.body;

  try {
    const result = await rateLimiter.withRateLimit(
      'clickup_sync',
      'global',
      async () => {
        return await syncPlaybooks({ force_sync, space_id, limit });
      }
    );

    const response: ApiResponse<SyncResult> = {
      success: true,
      data: result,
      message: `Successfully synced ${result.synced_count} playbooks`,
    };

    res.status(200).json(response);
  } catch (error) {
    logger.error('Sync error:', error as Error);
    
    const response: ApiResponse<SyncResult> = {
      success: false,
      error: error instanceof Error ? error.message : 'Sync failed',
    };

    res.status(500).json(response);
  }
}

async function syncPlaybooks(options: {
  force_sync: boolean;
  space_id?: string;
  limit: number;
}): Promise<SyncResult> {
  const clickupClient = new ClickUpClient();
  const dbClient = new DatabaseClient();
  const geminiClient = new GeminiClient();

  const result: SyncResult = {
    success: true,
    synced_count: 0,
    updated_count: 0,
    error_count: 0,
    errors: [],
  };

  try {
    logger.info('Starting playbook sync', { options });

    const tasks = await clickupClient.getTasks({
      folderId: options.space_id || undefined, // space_id can also be a folderId
      limit: options.limit,
      includeCompleted: false,
    });

    logger.info(`Found ${tasks.length} tasks from ClickUp`);

    for (const task of tasks) {
      try {
        const existingPlaybook = await dbClient.getPlaybookByClickUpId(task.id);

        if (existingPlaybook && !options.force_sync) {
          const taskUpdated = new Date(task.date_updated);
          const playbookUpdated = existingPlaybook.updated_at;

          if (taskUpdated <= playbookUpdated) {
            logger.debug(`Skipping unchanged playbook: ${task.name}`);
            continue;
          }
        }

        const searchableText = createSearchableText({
          title: task.name,
          description: task.description || '',
          content: task.description || task.name,
          tags: task.tags?.map(t => t.name) || [],
        });

        const embeddingResult = await geminiClient.generateEmbedding(searchableText);
        
        if (embeddingResult.error) {
          logger.warn(`Failed to generate embedding for ${task.name}:`, { error: embeddingResult.error });
        }

        const category = await geminiClient.categorizePlaybook(
          task.name,
          task.description || '',
          task.description || task.name
        );

        const playbook = {
          clickup_id: task.id,
          title: task.name,
          description: extractSummary(task.description || ''),
          content: extractTextFromHtml(task.description || task.name),
          category,
          tags: task.tags?.map(t => t.name) || [],
          url: task.url,
          embedding: embeddingResult.embedding.length > 0 ? embeddingResult.embedding : undefined,
        };

        const validation = validatePlaybook(playbook);
        if (!validation.success) {
          result.errors?.push(`Validation failed for ${task.name}: ${validation.error.message}`);
          result.error_count++;
          continue;
        }

        await dbClient.insertPlaybook(playbook);
        
        if (existingPlaybook) {
          result.updated_count++;
          logger.info(`Updated playbook: ${task.name}`);
        } else {
          result.synced_count++;
          logger.info(`Added new playbook: ${task.name}`);
        }

      } catch (error) {
        const errorMessage = `Failed to sync task ${task.name}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        logger.error(errorMessage, error as Error);
        result.errors?.push(errorMessage);
        result.error_count++;
      }
    }

    await dbClient.logSync(result);
    logger.info('Sync completed', { result });

  } catch (error) {
    result.success = false;
    const errorMessage = `Sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
    logger.error(errorMessage, error as Error);
    result.errors?.push(errorMessage);
    await dbClient.logSync(result);
  }

  return result;
}