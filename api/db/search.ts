import { VercelRequest, VercelResponse } from '@vercel/node';
import { DatabaseClient } from '../../lib/database';
import { ApiResponse, PlaybookSearchResult } from '../../types';
import { logger } from '../../utils/logger';
import { rateLimiter } from '../../utils/rate-limiter';
import { validateSearchQuery } from '../../utils/validation';

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
    const { embedding, category, limit = 5, threshold = 0.7 } = req.body;
    
    if (!embedding || !Array.isArray(embedding) || embedding.length === 0) {
      res.status(400).json({ 
        success: false, 
        error: 'Valid embedding array is required' 
      });
      return;
    }

    const userId = req.headers['x-user-id'] as string || 'anonymous';
    
    const results = await rateLimiter.withRateLimit(
      'database_search',
      userId,
      async () => {
        const dbClient = new DatabaseClient();
        return await dbClient.searchPlaybooksByEmbedding(embedding, {
          category,
          limit,
          threshold,
        });
      }
    );

    const response: ApiResponse<PlaybookSearchResult[]> = {
      success: true,
      data: results,
      message: `Found ${results.length} playbooks`,
    };

    res.status(200).json(response);
  } catch (error) {
    logger.error('Database search error:', error as Error);
    
    const response: ApiResponse<PlaybookSearchResult[]> = {
      success: false,
      error: error instanceof Error ? error.message : 'Database search failed',
    };

    res.status(500).json(response);
  }
}