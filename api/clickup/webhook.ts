import { VercelRequest, VercelResponse } from '@vercel/node';
import { ClickUpClient } from '../../lib/clickup';
import { DatabaseClient } from '../../lib/database';
import { GeminiClient } from '../../lib/gemini';
import { ApiResponse } from '../../types';
import { logger } from '../../utils/logger';
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

  try {
    const webhookData = req.body;
    
    if (!webhookData.event || !webhookData.task_id) {
      res.status(400).json({ success: false, error: 'Invalid webhook data' });
      return;
    }

    logger.info('Received ClickUp webhook', { event: webhookData.event, task_id: webhookData.task_id });

    const result = await processWebhookEvent(webhookData);

    const response: ApiResponse<string> = {
      success: true,
      data: result,
      message: 'Webhook processed successfully',
    };

    res.status(200).json(response);
  } catch (error) {
    logger.error('Webhook processing error:', error as Error);
    
    const response: ApiResponse<string> = {
      success: false,
      error: error instanceof Error ? error.message : 'Webhook processing failed',
    };

    res.status(500).json(response);
  }
}

async function processWebhookEvent(webhookData: any): Promise<string> {
  const clickupClient = new ClickUpClient();
  const dbClient = new DatabaseClient();
  const geminiClient = new GeminiClient();

  const { event, task_id } = webhookData;

  switch (event) {
    case 'taskCreated':
    case 'taskUpdated':
      return await handleTaskCreateOrUpdate(task_id, clickupClient, dbClient, geminiClient);

    case 'taskDeleted':
      return await handleTaskDelete(task_id, dbClient);

    case 'taskMoved':
      return await handleTaskMove(task_id, clickupClient, dbClient, geminiClient);

    default:
      logger.info(`Ignoring unsupported webhook event: ${event}`);
      return 'Event ignored';
  }
}

async function handleTaskCreateOrUpdate(
  taskId: string,
  clickupClient: ClickUpClient,
  dbClient: DatabaseClient,
  geminiClient: GeminiClient
): Promise<string> {
  try {
    const task = await clickupClient.getTask(taskId);
    
    if (!task) {
      logger.warn(`Task not found: ${taskId}`);
      return 'Task not found';
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
      throw new Error(`Validation failed: ${validation.error.message}`);
    }

    await dbClient.insertPlaybook(playbook);
    
    logger.info(`Successfully processed task: ${task.name}`);
    return 'Task processed successfully';
  } catch (error) {
    logger.error(`Error processing task ${taskId}:`, error as Error);
    throw error;
  }
}

async function handleTaskDelete(taskId: string, dbClient: DatabaseClient): Promise<string> {
  try {
    const existingPlaybook = await dbClient.getPlaybookByClickUpId(taskId);
    
    if (existingPlaybook) {
      await dbClient.deletePlaybook(existingPlaybook.id);
      logger.info(`Deleted playbook for task: ${taskId}`);
      return 'Playbook deleted successfully';
    }

    logger.info(`No playbook found for deleted task: ${taskId}`);
    return 'No playbook to delete';
  } catch (error) {
    logger.error(`Error deleting playbook for task ${taskId}:`, error as Error);
    throw error;
  }
}

async function handleTaskMove(
  taskId: string,
  clickupClient: ClickUpClient,
  dbClient: DatabaseClient,
  geminiClient: GeminiClient
): Promise<string> {
  return await handleTaskCreateOrUpdate(taskId, clickupClient, dbClient, geminiClient);
}