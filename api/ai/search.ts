import { VercelRequest, VercelResponse } from '@vercel/node';
import { GeminiClient } from '../../lib/gemini';
import { DatabaseClient } from '../../lib/database';
import { ApiResponse, PlaybookSearchResult } from '../../types';
import { logger } from '../../utils/logger';
import { rateLimiter } from '../../utils/rate-limiter';
import { embedCache, searchCache } from '../../utils/cache';
import { validateSearchQuery } from '../../utils/validation';
import { normalizeQuery } from '../../utils/text-processing';

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
    const { query, category, limit = 5, threshold = 0.7 } = req.body;
    
    const validation = validateSearchQuery({ query, category, limit, threshold });
    if (!validation.success) {
      res.status(400).json({ 
        success: false, 
        error: validation.error.message 
      });
      return;
    }

    const userId = req.headers['x-user-id'] as string || 'anonymous';
    
    const results = await rateLimiter.withRateLimit(
      'ai_search',
      userId,
      async () => {
        return await performSemanticSearch({
          query: normalizeQuery(query),
          category,
          limit,
          threshold,
        });
      }
    );

    const response: ApiResponse<PlaybookSearchResult[]> = {
      success: true,
      data: results,
      message: `Found ${results.length} relevant playbooks`,
    };

    res.status(200).json(response);
  } catch (error) {
    logger.error('Search error:', error as Error);
    
    const response: ApiResponse<PlaybookSearchResult[]> = {
      success: false,
      error: error instanceof Error ? error.message : 'Search failed',
    };

    res.status(500).json(response);
  }
}

async function performSemanticSearch(options: {
  query: string;
  category?: string;
  limit: number;
  threshold: number;
}): Promise<PlaybookSearchResult[]> {
  const { query, category, limit, threshold } = options;
  
  const cacheKey = `search:${query}:${category || 'all'}:${limit}:${threshold}`;
  
  const cachedResults = searchCache.get(cacheKey);
  if (cachedResults) {
    logger.debug('Returning cached search results');
    return cachedResults;
  }

  logger.info('Performing semantic search', { query, category, limit, threshold });

  const geminiClient = new GeminiClient();
  const dbClient = new DatabaseClient();

  const embedCacheKey = `embedding:${query}`;
  let queryEmbedding = embedCache.get(embedCacheKey);

  if (!queryEmbedding) {
    logger.debug('Generating embedding for query');
    const embeddingResult = await geminiClient.generateEmbedding(query);
    
    if (embeddingResult.error || embeddingResult.embedding.length === 0) {
      logger.error('Failed to generate embedding for query', { error: embeddingResult.error });
      throw new Error('Failed to generate embedding for search query');
    }

    queryEmbedding = embeddingResult.embedding;
    embedCache.set(embedCacheKey, queryEmbedding);
  }

  const searchResults = await dbClient.searchPlaybooksByEmbedding(queryEmbedding, {
    category,
    limit: limit * 2,
    threshold,
  });

  const enhancedResults = await Promise.all(
    searchResults.slice(0, limit).map(async (result) => {
      try {
        const reasoning = await geminiClient.generateRecommendationReasoning(query, {
          title: result.playbook.title,
          description: result.playbook.description,
          category: result.playbook.category,
        });

        return {
          ...result,
          relevance_reason: reasoning,
        };
      } catch (error) {
        logger.warn('Failed to generate reasoning for playbook', { 
          playbook: result.playbook.title,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        return result;
      }
    })
  );

  searchCache.set(cacheKey, enhancedResults);
  
  logger.info('Search completed', { 
    query, 
    results_count: enhancedResults.length,
    top_score: enhancedResults.length > 0 ? enhancedResults[0].similarity_score : 0
  });

  return enhancedResults;
}