import { VercelRequest, VercelResponse } from '@vercel/node';
import { DatabaseClient } from '../../lib/database';
import { ApiResponse, Playbook } from '../../types';
import { logger } from '../../utils/logger';
import { rateLimiter } from '../../utils/rate-limiter';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  const userId = req.headers['x-user-id'] as string || 'anonymous';

  try {
    switch (req.method) {
      case 'GET':
        await handleGetPlaybooks(req, res, userId);
        break;
      case 'POST':
        await handleCreatePlaybook(req, res, userId);
        break;
      case 'PUT':
        await handleUpdatePlaybook(req, res, userId);
        break;
      case 'DELETE':
        await handleDeletePlaybook(req, res, userId);
        break;
      default:
        res.setHeader('Allow', ['GET', 'POST', 'PUT', 'DELETE']);
        res.status(405).json({ success: false, error: 'Method not allowed' });
    }
  } catch (error) {
    logger.error('Playbooks API error:', error as Error);
    
    const response: ApiResponse<any> = {
      success: false,
      error: error instanceof Error ? error.message : 'Operation failed',
    };

    res.status(500).json(response);
  }
}

async function handleGetPlaybooks(
  req: VercelRequest,
  res: VercelResponse,
  userId: string
): Promise<void> {
  const { category, limit = 100, offset = 0, id } = req.query;

  const result = await rateLimiter.withRateLimit(
    'database_read',
    userId,
    async () => {
      const dbClient = new DatabaseClient();
      
      if (id) {
        const playbook = await dbClient.getPlaybook(id as string);
        return playbook ? [playbook] : [];
      }

      return await dbClient.getAllPlaybooks({
        category: category as string,
        limit: parseInt(limit as string, 10),
        offset: parseInt(offset as string, 10),
      });
    }
  );

  const response: ApiResponse<Playbook[]> = {
    success: true,
    data: result,
    message: `Retrieved ${result.length} playbooks`,
  };

  res.status(200).json(response);
}

async function handleCreatePlaybook(
  req: VercelRequest,
  res: VercelResponse,
  userId: string
): Promise<void> {
  const playbookData = req.body;

  const result = await rateLimiter.withRateLimit(
    'database_write',
    userId,
    async () => {
      const dbClient = new DatabaseClient();
      return await dbClient.insertPlaybook(playbookData);
    }
  );

  const response: ApiResponse<{ id: string }> = {
    success: true,
    data: { id: result },
    message: 'Playbook created successfully',
  };

  res.status(201).json(response);
}

async function handleUpdatePlaybook(
  req: VercelRequest,
  res: VercelResponse,
  userId: string
): Promise<void> {
  const { id } = req.query;
  const updateData = req.body;

  if (!id) {
    res.status(400).json({ success: false, error: 'Playbook ID is required' });
    return;
  }

  await rateLimiter.withRateLimit(
    'database_write',
    userId,
    async () => {
      const dbClient = new DatabaseClient();
      
      const existingPlaybook = await dbClient.getPlaybook(id as string);
      if (!existingPlaybook) {
        throw new Error('Playbook not found');
      }

      return await dbClient.insertPlaybook({
        ...existingPlaybook,
        ...updateData,
        id: undefined,
        created_at: undefined,
        updated_at: undefined,
      });
    }
  );

  const response: ApiResponse<string> = {
    success: true,
    message: 'Playbook updated successfully',
  };

  res.status(200).json(response);
}

async function handleDeletePlaybook(
  req: VercelRequest,
  res: VercelResponse,
  userId: string
): Promise<void> {
  const { id } = req.query;

  if (!id) {
    res.status(400).json({ success: false, error: 'Playbook ID is required' });
    return;
  }

  await rateLimiter.withRateLimit(
    'database_write',
    userId,
    async () => {
      const dbClient = new DatabaseClient();
      await dbClient.deletePlaybook(id as string);
    }
  );

  const response: ApiResponse<string> = {
    success: true,
    message: 'Playbook deleted successfully',
  };

  res.status(200).json(response);
}