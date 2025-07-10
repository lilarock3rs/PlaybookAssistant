import { VercelRequest, VercelResponse } from '@vercel/node';
import { GeminiClient } from '../../lib/gemini';
import { DatabaseClient } from '../../lib/database';
import { ApiResponse, PlaybookSearchResult } from '../../types';
import { logger } from '../../utils/logger';
import { rateLimiter } from '../../utils/rate-limiter';
import { searchCache } from '../../utils/cache';
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
    const { 
      query, 
      user_context = {},
      limit = 5,
      include_reasoning = true,
      category 
    } = req.body;
    
    if (!query || typeof query !== 'string') {
      res.status(400).json({ 
        success: false, 
        error: 'Query is required and must be a string' 
      });
      return;
    }

    const userId = req.headers['x-user-id'] as string || 'anonymous';
    
    const results = await rateLimiter.withRateLimit(
      'ai_recommendations',
      userId,
      async () => {
        return await generateRecommendations({
          query: normalizeQuery(query),
          userContext: user_context,
          limit,
          includeReasoning: include_reasoning,
          category,
        });
      }
    );

    const response: ApiResponse<{
      recommendations: PlaybookSearchResult[];
      suggestions: string[];
      query_analysis: string;
    }> = {
      success: true,
      data: results,
      message: `Generated ${results.recommendations.length} recommendations`,
    };

    res.status(200).json(response);
  } catch (error) {
    logger.error('Recommendations error:', error as Error);
    
    const response: ApiResponse<any> = {
      success: false,
      error: error instanceof Error ? error.message : 'Recommendations generation failed',
    };

    res.status(500).json(response);
  }
}

async function generateRecommendations(options: {
  query: string;
  userContext: any;
  limit: number;
  includeReasoning: boolean;
  category?: string;
}): Promise<{
  recommendations: PlaybookSearchResult[];
  suggestions: string[];
  query_analysis: string;
}> {
  const { query, userContext, limit, includeReasoning, category } = options;
  
  const cacheKey = `recommendations:${query}:${category || 'all'}:${limit}`;
  
  const cachedResults = searchCache.get(cacheKey);
  if (cachedResults) {
    logger.debug('Returning cached recommendations');
    return cachedResults;
  }

  logger.info('Generating recommendations', { query, category, limit });

  const geminiClient = new GeminiClient();
  const dbClient = new DatabaseClient();

  const embeddingResult = await geminiClient.generateEmbedding(query);
  
  if (embeddingResult.error || embeddingResult.embedding.length === 0) {
    logger.error('Failed to generate embedding for recommendations', { error: embeddingResult.error });
    throw new Error('Failed to generate embedding for recommendations');
  }

  const searchResults = await dbClient.searchPlaybooksByEmbedding(embeddingResult.embedding, {
    category,
    limit: Math.min(limit * 2, 20),
    threshold: 0.6,
  });

  const [suggestions, queryAnalysis] = await Promise.all([
    geminiClient.generateSearchSuggestions(query),
    generateQueryAnalysis(query, userContext, geminiClient),
  ]);

  let recommendations = searchResults.slice(0, limit);

  if (includeReasoning) {
    recommendations = await Promise.all(
      recommendations.map(async (result) => {
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
          logger.warn('Failed to generate reasoning for recommendation', { 
            playbook: result.playbook.title,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
          return result;
        }
      })
    );
  }

  const result = {
    recommendations,
    suggestions,
    query_analysis: queryAnalysis,
  };

  searchCache.set(cacheKey, result);
  
  logger.info('Recommendations generated', { 
    query, 
    recommendations_count: recommendations.length,
    suggestions_count: suggestions.length
  });

  return result;
}

async function generateQueryAnalysis(
  query: string,
  userContext: any,
  geminiClient: GeminiClient
): Promise<string> {
  try {
    const contextInfo = userContext.role ? `User role: ${userContext.role}` : '';
    const prompt = `
      Analyze this search query and provide a brief summary of what the user is likely looking for:
      
      Query: "${query}"
      ${contextInfo}
      
      Provide a 1-2 sentence analysis of the user's intent and what type of playbooks would be most helpful.
    `;

    const analysis = await geminiClient.generateRecommendationReasoning(query, {
      title: 'Query Analysis',
      description: prompt,
      category: 'Analysis',
    });

    return analysis;
  } catch (error) {
    logger.warn('Failed to generate query analysis', { error: error instanceof Error ? error.message : 'Unknown error' });
    return `Looking for playbooks related to: ${query}`;
  }
}