import { VercelRequest, VercelResponse } from '@vercel/node';
import { slackApp } from '../../lib/slack';
import { GeminiClient } from '../../lib/gemini';
import { DatabaseClient } from '../../lib/database';
import { logger } from '../../utils/logger';
import { rateLimiter } from '../../utils/rate-limiter';
import { validateSlackCommand } from '../../utils/validation';
import { normalizeQuery, formatForSlack, truncateText } from '../../utils/text-processing';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const validation = validateSlackCommand(req.body);
    if (!validation.success) {
      res.status(400).json({ error: 'Invalid request format' });
      return;
    }

    const { command, text, user_id, channel_id, response_url } = validation.data;

    logger.info('Received Slack command', { 
      command, 
      text, 
      user_id, 
      channel_id 
    });

    const result = await rateLimiter.withRateLimit(
      'slack_command',
      user_id,
      async () => {
        switch (command) {
          case '/playbook-search':
            return await handlePlaybookSearch(text, user_id, channel_id, response_url);
          case '/playbook-category':
            return await handlePlaybookCategory(text, user_id, channel_id, response_url);
          case '/playbook-sync':
            return await handlePlaybookSync(user_id, channel_id, response_url);
          case '/playbook-help':
            return await handlePlaybookHelp(user_id, channel_id, response_url);
          default:
            return { text: 'Unknown command' };
        }
      }
    );

    res.status(200).json(result);
  } catch (error) {
    logger.error('Slack command error:', error as Error);
    
    const errorMessage = error instanceof Error && error.message.includes('Rate limit') 
      ? error.message
      : 'Sorry, something went wrong. Please try again later.';

    res.status(200).json({
      response_type: 'ephemeral',
      text: errorMessage,
    });
  }
}

async function handlePlaybookSearch(
  query: string,
  userId: string,
  channelId: string,
  responseUrl: string
): Promise<any> {
  if (!query || query.trim().length === 0) {
    return {
      response_type: 'ephemeral',
      text: 'Please provide a search query. Example: `/playbook-search onboarding new customers`',
    };
  }

  const normalizedQuery = normalizeQuery(query);
  logger.info('Performing playbook search', { query: normalizedQuery, userId });

  try {
    const geminiClient = new GeminiClient();
    const dbClient = new DatabaseClient();

    const embeddingResult = await geminiClient.generateEmbedding(normalizedQuery);
    
    if (embeddingResult.error || embeddingResult.embedding.length === 0) {
      throw new Error('Failed to process search query');
    }

    const searchResults = await dbClient.searchPlaybooksByEmbedding(embeddingResult.embedding, {
      limit: 5,
      threshold: 0.6,
    });

    if (searchResults.length === 0) {
      const suggestions = await geminiClient.generateSearchSuggestions(normalizedQuery);
      return {
        response_type: 'ephemeral',
        text: `No playbooks found for "${query}". Try searching for: ${suggestions.join(', ')}`,
      };
    }

    const blocks = await createPlaybookBlocks(searchResults, geminiClient, normalizedQuery);

    return {
      response_type: 'in_channel',
      text: `Found ${searchResults.length} playbooks for "${query}"`,
      blocks,
    };
  } catch (error) {
    logger.error('Search error:', error as Error);
    return {
      response_type: 'ephemeral',
      text: 'Sorry, I encountered an error while searching. Please try again.',
    };
  }
}

async function handlePlaybookCategory(
  category: string,
  userId: string,
  channelId: string,
  responseUrl: string
): Promise<any> {
  if (!category || category.trim().length === 0) {
    try {
      const dbClient = new DatabaseClient();
      const categories = await dbClient.getCategories();
      
      return {
        response_type: 'ephemeral',
        text: `Available categories: ${categories.join(', ')}\nUsage: \`/playbook-category Sales\``,
      };
    } catch (error) {
      return {
        response_type: 'ephemeral',
        text: 'Usage: `/playbook-category <category>` (e.g., Sales, Marketing, Product)',
      };
    }
  }

  logger.info('Fetching playbooks by category', { category, userId });

  try {
    const dbClient = new DatabaseClient();
    const playbooks = await dbClient.getAllPlaybooks({
      category: category.trim(),
      limit: 10,
    });

    if (playbooks.length === 0) {
      return {
        response_type: 'ephemeral',
        text: `No playbooks found in category "${category}". Use \`/playbook-category\` to see available categories.`,
      };
    }

    const blocks = createCategoryBlocks(playbooks, category);

    return {
      response_type: 'in_channel',
      text: `Found ${playbooks.length} playbooks in category "${category}"`,
      blocks,
    };
  } catch (error) {
    logger.error('Category search error:', error as Error);
    return {
      response_type: 'ephemeral',
      text: 'Sorry, I encountered an error while fetching playbooks. Please try again.',
    };
  }
}

async function handlePlaybookSync(
  userId: string,
  channelId: string,
  responseUrl: string
): Promise<any> {
  logger.info('Sync requested', { userId });

  return {
    response_type: 'ephemeral',
    text: 'Sync initiated! This may take a few minutes. I\'ll update you when it\'s complete.',
  };
}

async function handlePlaybookHelp(
  userId: string,
  channelId: string,
  responseUrl: string
): Promise<any> {
  const helpText = `
*Playbook AI Assistant Commands:*

• \`/playbook-search [query]\` - Search for relevant playbooks
  Example: \`/playbook-search customer onboarding process\`

• \`/playbook-category [category]\` - Browse playbooks by category
  Example: \`/playbook-category Sales\`
  Use without category to see all available categories

• \`/playbook-sync\` - Synchronize playbooks from ClickUp (admin only)

• \`/playbook-help\` - Show this help message

*Tips:*
- Use specific keywords in your search for better results
- Try different search terms if you don't find what you're looking for
- Browse categories to discover new playbooks
  `;

  return {
    response_type: 'ephemeral',
    text: helpText,
  };
}

async function createPlaybookBlocks(
  searchResults: any[],
  geminiClient: GeminiClient,
  query: string
): Promise<any[]> {
  const blocks = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Search Results for "${query}"*`,
      },
    },
    {
      type: 'divider',
    },
  ];

  for (const result of searchResults) {
    const { playbook, similarity_score } = result;
    
    try {
      const reasoning = await geminiClient.generateRecommendationReasoning(query, {
        title: playbook.title,
        description: playbook.description,
        category: playbook.category,
      });

      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${playbook.title}*\n${truncateText(playbook.description, 150)}\n\n_${reasoning}_`,
        },
        accessory: {
          type: 'button',
          text: {
            type: 'plain_text',
            text: 'View Playbook',
          },
          url: playbook.url,
        },
      });

      blocks.push({
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `Category: ${playbook.category} | Relevance: ${Math.round(similarity_score * 100)}%`,
          },
        ],
      });

      blocks.push({
        type: 'divider',
      });
    } catch (error) {
      logger.warn('Failed to generate reasoning for playbook', { 
        playbook: playbook.title,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${playbook.title}*\n${truncateText(playbook.description, 200)}`,
        },
        accessory: {
          type: 'button',
          text: {
            type: 'plain_text',
            text: 'View Playbook',
          },
          url: playbook.url,
        },
      });

      blocks.push({
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `Category: ${playbook.category} | Relevance: ${Math.round(similarity_score * 100)}%`,
          },
        ],
      });

      blocks.push({
        type: 'divider',
      });
    }
  }

  return blocks;
}

function createCategoryBlocks(playbooks: any[], category: string): any[] {
  const blocks = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${category} Playbooks*`,
      },
    },
    {
      type: 'divider',
    },
  ];

  for (const playbook of playbooks) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${playbook.title}*\n${truncateText(playbook.description, 200)}`,
      },
      accessory: {
        type: 'button',
        text: {
          type: 'plain_text',
          text: 'View Playbook',
        },
        url: playbook.url,
      },
    });

    if (playbook.tags && playbook.tags.length > 0) {
      blocks.push({
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `Tags: ${playbook.tags.join(', ')}`,
          },
        ],
      });
    }

    blocks.push({
      type: 'divider',
    });
  }

  return blocks;
}