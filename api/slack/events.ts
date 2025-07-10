import { VercelRequest, VercelResponse } from '@vercel/node';
import { slackApp } from '../../lib/slack';
import { logger } from '../../utils/logger';
import { validateSlackCommand } from '../../utils/validation';

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
    if (req.body.type === 'url_verification') {
      logger.info('Handling Slack URL verification');
      res.status(200).json({ challenge: req.body.challenge });
      return;
    }

    if (req.body.type === 'event_callback') {
      const event = req.body.event;
      
      logger.info('Received Slack event', { 
        type: event.type, 
        user: event.user,
        channel: event.channel 
      });

      switch (event.type) {
        case 'app_mention':
          await handleAppMention(event);
          break;
        case 'message':
          await handleMessage(event);
          break;
        default:
          logger.debug('Unhandled event type:', event.type);
      }
    }

    res.status(200).json({ ok: true });
  } catch (error) {
    logger.error('Slack events error:', error as Error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

async function handleAppMention(event: any): Promise<void> {
  try {
    const { text, user, channel } = event;
    
    const query = text.replace(/<@[^>]+>/g, '').trim();
    
    if (!query) {
      await slackApp.client.chat.postMessage({
        channel,
        text: 'Hi! I can help you find relevant playbooks. Try asking me something like "help me with customer onboarding" or use the `/playbook-search` command.',
      });
      return;
    }

    logger.info('Processing app mention', { query, user, channel });

    await slackApp.client.chat.postMessage({
      channel,
      text: `Looking for playbooks related to: "${query}"...`,
    });

    const response = await fetch(`${process.env.VERCEL_URL}/api/ai/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': user,
      },
      body: JSON.stringify({
        query,
        limit: 3,
        threshold: 0.6,
      }),
    });

    const searchData = await response.json();

    if (searchData.success && searchData.data.length > 0) {
      const blocks = createMentionResponseBlocks(searchData.data, query);
      
      await slackApp.client.chat.postMessage({
        channel,
        text: `Found ${searchData.data.length} relevant playbooks:`,
        blocks,
      });
    } else {
      await slackApp.client.chat.postMessage({
        channel,
        text: `I couldn't find any playbooks matching "${query}". Try using different keywords or browse categories with \`/playbook-category\`.`,
      });
    }
  } catch (error) {
    logger.error('App mention handling error:', error as Error);
    
    await slackApp.client.chat.postMessage({
      channel: event.channel,
      text: 'Sorry, I encountered an error while searching. Please try again or use the `/playbook-search` command.',
    });
  }
}

async function handleMessage(event: any): Promise<void> {
  if (event.subtype === 'bot_message' || event.bot_id) {
    return;
  }

  const { text, user, channel } = event;
  
  const playbookKeywords = [
    'playbook', 'process', 'guide', 'how to', 'procedure', 'workflow',
    'documentation', 'manual', 'instruction', 'template', 'best practice'
  ];

  const hasPlaybookKeyword = playbookKeywords.some(keyword => 
    text.toLowerCase().includes(keyword)
  );

  if (hasPlaybookKeyword && text.includes('?')) {
    logger.info('Detected potential playbook question', { text, user, channel });
    
    await slackApp.client.chat.postMessage({
      channel,
      text: `I noticed you might be looking for a playbook! Try using \`/playbook-search ${text.replace('?', '')}\` to find relevant guides.`,
    });
  }
}

function createMentionResponseBlocks(searchResults: any[], query: string): any[] {
  const blocks = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Here are the most relevant playbooks for "${query}":*`,
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
          text: `Category: ${playbook.category}`,
        },
      ],
    });

    blocks.push({
      type: 'divider',
    });
  }

  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: 'Use `/playbook-search` for more detailed searches or `/playbook-category` to browse by category.',
    },
  });

  return blocks;
}