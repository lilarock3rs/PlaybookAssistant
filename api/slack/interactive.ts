import { VercelRequest, VercelResponse } from '@vercel/node';
import { slackApp } from '../../lib/slack';
import { logger } from '../../utils/logger';
import { rateLimiter } from '../../utils/rate-limiter';

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
    const payload = JSON.parse(req.body.payload);
    
    logger.info('Received interactive component', { 
      type: payload.type,
      user: payload.user.id,
      callback_id: payload.callback_id 
    });

    switch (payload.type) {
      case 'block_actions':
        await handleBlockActions(payload);
        break;
      case 'view_submission':
        await handleViewSubmission(payload);
        break;
      case 'view_closed':
        await handleViewClosed(payload);
        break;
      default:
        logger.debug('Unhandled interactive component type:', payload.type);
    }

    res.status(200).json({ ok: true });
  } catch (error) {
    logger.error('Interactive component error:', error as Error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

async function handleBlockActions(payload: any): Promise<void> {
  const { actions, user, channel, response_url } = payload;
  
  for (const action of actions) {
    try {
      await rateLimiter.withRateLimit(
        'slack_interaction',
        user.id,
        async () => {
          switch (action.action_id) {
            case 'search_more':
              await handleSearchMore(action, user, channel, response_url);
              break;
            case 'category_browse':
              await handleCategoryBrowse(action, user, channel, response_url);
              break;
            case 'feedback':
              await handleFeedback(action, user, channel, response_url);
              break;
            default:
              logger.debug('Unhandled block action:', action.action_id);
          }
        }
      );
    } catch (error) {
      logger.error('Block action handling error:', error as Error);
      
      await slackApp.client.chat.postEphemeral({
        channel: channel.id,
        user: user.id,
        text: 'Sorry, I encountered an error processing your request. Please try again.',
      });
    }
  }
}

async function handleSearchMore(action: any, user: any, channel: any, responseUrl: string): Promise<void> {
  const query = action.value;
  
  logger.info('Handling search more request', { query, user: user.id });

  try {
    const response = await fetch(`${process.env.VERCEL_URL}/api/ai/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': user.id,
      },
      body: JSON.stringify({
        query,
        limit: 10,
        threshold: 0.5,
      }),
    });

    const searchData = await response.json();

    if (searchData.success && searchData.data.length > 0) {
      const blocks = createExpandedSearchBlocks(searchData.data, query);
      
      await slackApp.client.chat.postMessage({
        channel: channel.id,
        text: `Extended search results for "${query}":`,
        blocks,
      });
    } else {
      await slackApp.client.chat.postEphemeral({
        channel: channel.id,
        user: user.id,
        text: `No additional results found for "${query}". Try different keywords or browse categories.`,
      });
    }
  } catch (error) {
    logger.error('Search more error:', error as Error);
    throw error;
  }
}

async function handleCategoryBrowse(action: any, user: any, channel: any, responseUrl: string): Promise<void> {
  const category = action.value;
  
  logger.info('Handling category browse request', { category, user: user.id });

  try {
    const response = await fetch(`${process.env.VERCEL_URL}/api/slack/commands`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        command: '/playbook-category',
        text: category,
        user_id: user.id,
        channel_id: channel.id,
        response_url: responseUrl,
      }),
    });

    const commandData = await response.json();

    if (commandData.blocks) {
      await slackApp.client.chat.postMessage({
        channel: channel.id,
        text: commandData.text,
        blocks: commandData.blocks,
      });
    }
  } catch (error) {
    logger.error('Category browse error:', error as Error);
    throw error;
  }
}

async function handleFeedback(action: any, user: any, channel: any, responseUrl: string): Promise<void> {
  const feedback = action.value;
  
  logger.info('Received feedback', { feedback, user: user.id });

  try {
    await slackApp.client.chat.postEphemeral({
      channel: channel.id,
      user: user.id,
      text: 'Thank you for your feedback! It helps us improve the playbook recommendations.',
    });
  } catch (error) {
    logger.error('Feedback handling error:', error as Error);
    throw error;
  }
}

async function handleViewSubmission(payload: any): Promise<void> {
  const { view, user } = payload;
  
  logger.info('Handling view submission', { 
    view_id: view.id,
    callback_id: view.callback_id,
    user: user.id 
  });

  try {
    switch (view.callback_id) {
      case 'search_modal':
        await handleSearchModal(view, user);
        break;
      case 'feedback_modal':
        await handleFeedbackModal(view, user);
        break;
      default:
        logger.debug('Unhandled view submission:', view.callback_id);
    }
  } catch (error) {
    logger.error('View submission error:', error as Error);
    throw error;
  }
}

async function handleSearchModal(view: any, user: any): Promise<void> {
  const query = view.state.values.query_input.query.value;
  const category = view.state.values.category_select?.category?.selected_option?.value;
  
  logger.info('Processing search modal submission', { query, category, user: user.id });

  try {
    const response = await fetch(`${process.env.VERCEL_URL}/api/ai/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': user.id,
      },
      body: JSON.stringify({
        query,
        category,
        limit: 5,
        threshold: 0.6,
      }),
    });

    const searchData = await response.json();

    if (searchData.success && searchData.data.length > 0) {
      const blocks = createModalSearchBlocks(searchData.data, query);
      
      await slackApp.client.chat.postMessage({
        channel: user.id,
        text: `Search results for "${query}":`,
        blocks,
      });
    } else {
      await slackApp.client.chat.postMessage({
        channel: user.id,
        text: `No results found for "${query}". Try different keywords or browse categories.`,
      });
    }
  } catch (error) {
    logger.error('Search modal error:', error as Error);
    throw error;
  }
}

async function handleFeedbackModal(view: any, user: any): Promise<void> {
  const feedback = view.state.values.feedback_input.feedback.value;
  const rating = view.state.values.rating_select?.rating?.selected_option?.value;
  
  logger.info('Processing feedback modal submission', { 
    feedback_length: feedback.length,
    rating,
    user: user.id 
  });

  await slackApp.client.chat.postMessage({
    channel: user.id,
    text: 'Thank you for your feedback! We appreciate your input to help improve our playbook recommendations.',
  });
}

async function handleViewClosed(payload: any): Promise<void> {
  const { view, user } = payload;
  
  logger.info('View closed', { 
    view_id: view.id,
    callback_id: view.callback_id,
    user: user.id 
  });
}

function createExpandedSearchBlocks(searchResults: any[], query: string): any[] {
  const blocks = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Extended Search Results for "${query}"*`,
      },
    },
    {
      type: 'divider',
    },
  ];

  for (const result of searchResults) {
    const { playbook, similarity_score } = result;
    
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${playbook.title}*\n${playbook.description}\n\n_Relevance: ${Math.round(similarity_score * 100)}%_`,
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
          text: `Category: ${playbook.category}`,
        },
      ],
    });

    blocks.push({
      type: 'divider',
    });
  }

  return blocks;
}

function createModalSearchBlocks(searchResults: any[], query: string): any[] {
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
    
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${playbook.title}*\n${playbook.description}`,
      },
      accessory: {
        type: 'button',
        text: {
          type: 'plain_text',
          text: 'Open Playbook',
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

  return blocks;
}