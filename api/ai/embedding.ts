import { VercelRequest, VercelResponse } from '@vercel/node';
import { GeminiClient } from '../../lib/gemini';
import { ApiResponse, EmbeddingResponse } from '../../types';
import { logger } from '../../utils/logger';
import { rateLimiter } from '../../utils/rate-limiter';
import { embedCache } from '../../utils/cache';
import { sanitizeText } from '../../utils/validation';

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
    const { text, use_cache = true } = req.body;
    
    if (!text || typeof text !== 'string') {
      res.status(400).json({ 
        success: false, 
        error: 'Text is required and must be a string' 
      });
      return;
    }

    if (text.length > 10000) {
      res.status(400).json({ 
        success: false, 
        error: 'Text is too long (max 10000 characters)' 
      });
      return;
    }

    const userId = req.headers['x-user-id'] as string || 'anonymous';
    
    const result = await rateLimiter.withRateLimit(
      'ai_embedding',
      userId,
      async () => {
        return await generateEmbedding(sanitizeText(text), use_cache);
      }
    );

    const response: ApiResponse<EmbeddingResponse> = {
      success: true,
      data: result,
      message: 'Embedding generated successfully',
    };

    res.status(200).json(response);
  } catch (error) {
    logger.error('Embedding generation error:', error as Error);
    
    const response: ApiResponse<EmbeddingResponse> = {
      success: false,
      error: error instanceof Error ? error.message : 'Embedding generation failed',
    };

    res.status(500).json(response);
  }
}

async function generateEmbedding(text: string, useCache: boolean = true): Promise<EmbeddingResponse> {
  const cacheKey = `embedding:${text}`;
  
  if (useCache) {
    const cachedEmbedding = embedCache.get(cacheKey);
    if (cachedEmbedding) {
      logger.debug('Returning cached embedding');
      return { embedding: cachedEmbedding };
    }
  }

  logger.info('Generating new embedding', { text_length: text.length });

  const geminiClient = new GeminiClient();
  const result = await geminiClient.generateEmbedding(text);

  if (result.error) {
    logger.error('Failed to generate embedding', { error: result.error });
    throw new Error(`Embedding generation failed: ${result.error}`);
  }

  if (result.embedding.length === 0) {
    logger.error('Empty embedding returned');
    throw new Error('Empty embedding returned from AI service');
  }

  if (useCache) {
    embedCache.set(cacheKey, result.embedding);
  }

  logger.info('Embedding generated successfully', { 
    dimensions: result.embedding.length,
    first_few_values: result.embedding.slice(0, 5)
  });

  return result;
}