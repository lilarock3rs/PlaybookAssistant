import { VercelRequest, VercelResponse } from '@vercel/node';
import { DatabaseClient } from '../../lib/database';
import { ApiResponse } from '../../types';
import { logger } from '../../utils/logger';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    res.status(405).json({ success: false, error: 'Method not allowed' });
    return;
  }

  try {
    const dbClient = new DatabaseClient();
    
    const recentSyncs = await dbClient.getRecentSyncLogs(5);
    const totalPlaybooks = await dbClient.getAllPlaybooks({ limit: 1 });
    const categories = await dbClient.getCategories();

    const lastSync = recentSyncs.length > 0 ? recentSyncs[0] : null;

    const status = {
      total_playbooks: totalPlaybooks.length,
      categories: categories.length,
      last_sync: lastSync ? {
        status: lastSync.status,
        started_at: lastSync.started_at,
        completed_at: lastSync.completed_at,
        synced_count: lastSync.synced_count,
        updated_count: lastSync.updated_count,
        error_count: lastSync.error_count,
      } : null,
      recent_syncs: recentSyncs.map(sync => ({
        id: sync.id,
        status: sync.status,
        started_at: sync.started_at,
        completed_at: sync.completed_at,
        synced_count: sync.synced_count,
        updated_count: sync.updated_count,
        error_count: sync.error_count,
      })),
      available_categories: categories,
    };

    const response: ApiResponse<typeof status> = {
      success: true,
      data: status,
      message: 'Status retrieved successfully',
    };

    res.status(200).json(response);
  } catch (error) {
    logger.error('Error retrieving sync status:', error as Error);
    
    const response: ApiResponse<null> = {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to retrieve status',
    };

    res.status(500).json(response);
  }
}