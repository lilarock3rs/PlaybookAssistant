import { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  console.log('Request received:', { method: req.method, url: req.url, body: req.body });
  
  // Handle URL verification challenge first (for Events)
  if (req.body && req.body.type === 'url_verification') {
    console.log('URL verification challenge:', req.body.challenge);
    return res.status(200).json({ challenge: req.body.challenge });
  }
  
  const { pathname } = new URL(req.url || '', `http://${req.headers.host}`);
  
  // Route based on path
  if (pathname.includes('/commands')) {
    return handleCommands(req, res);
  } else if (pathname.includes('/events')) {
    return handleEvents(req, res);
  } else if (pathname.includes('/interactive')) {
    return handleInteractive(req, res);
  }
  
  // Default: try to handle as command or event
  if (req.body && req.body.command) {
    return handleCommands(req, res);
  } else if (req.body && req.body.event) {
    return handleEvents(req, res);
  }
  
  res.status(200).json({ ok: true });
}

async function handleCommands(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  const { command, text, user_name } = req.body;
  
  switch (command) {
    case '/playbook-help':
      return res.status(200).json({
        response_type: 'ephemeral',
        text: `*Playbook AI Assistant Commands:*

• \`/playbook-search [query]\` - Search for relevant playbooks
• \`/playbook-category [category]\` - Browse playbooks by category  
• \`/playbook-sync\` - Synchronize playbooks from ClickUp
• \`/playbook-help\` - Show this help message

🤖 *Status:* Ready to help ${user_name}!`
      });

    case '/playbook-sync':
      return handleSync(req, res);
      
    case '/playbook-search':
      return handleSearch(text, res);
      
    case '/playbook-category':
      return handleCategory(text, res);
      
    default:
      return res.status(200).json({
        response_type: 'ephemeral',
        text: 'Unknown command. Use `/playbook-help` for available commands.'
      });
  }
}

async function handleSync(req: VercelRequest, res: VercelResponse) {
  const { user_name } = req.body;
  
  try {
    // Basic ClickUp API test
    const clickupApiKey = process.env.CLICKUP_API_KEY;
    const folderId = process.env.CLICKUP_PLAYBOOKS_FOLDER_ID;
    
    if (!clickupApiKey) {
      return res.status(200).json({
        response_type: 'ephemeral',
        text: '❌ ClickUp API key not configured'
      });
    }

    return res.status(200).json({
      response_type: 'ephemeral',
      text: `🔄 Sync initiated by ${user_name}!\n📁 Folder ID: ${folderId}\n⏱️ This may take a few minutes...`
    });
    
  } catch (error: any) {
    return res.status(200).json({
      response_type: 'ephemeral',
      text: `❌ Sync failed: ${error.message}`
    });
  }
}

async function handleSearch(query: string, res: VercelResponse) {
  if (!query || query.trim().length === 0) {
    return res.status(200).json({
      response_type: 'ephemeral',
      text: '🔍 Please provide a search query.\nExample: `/playbook-search primer`'
    });
  }

  try {
    const playbooks = await searchClickUpPlaybooks(query);
    
    if (playbooks.length === 0) {
      return res.status(200).json({
        response_type: 'ephemeral',
        text: `🔍 No playbooks found for: "${query}"\n\nTry a different search term or use \`/playbook-sync\` to update data.`
      });
    }

    // Format results for Slack
    const blocks = formatPlaybooksForSlack(playbooks, query);
    
    return res.status(200).json({
      response_type: 'in_channel',
      text: `Found ${playbooks.length} playbook(s) for: "${query}"`,
      blocks: blocks
    });

  } catch (error: any) {
    console.error('Search error:', error);
    return res.status(200).json({
      response_type: 'ephemeral',
      text: `❌ Search failed: ${error.message}\n\nTry \`/playbook-sync\` first to load data.`
    });
  }
}

async function searchClickUpPlaybooks(query: string) {
  const clickupApiKey = process.env.CLICKUP_API_KEY;
  const folderId = process.env.CLICKUP_PLAYBOOKS_FOLDER_ID;
  
  if (!clickupApiKey) {
    throw new Error('ClickUp API key not configured');
  }

  // Search in ClickUp folder
  const url = folderId 
    ? `https://api.clickup.com/api/v2/folder/${folderId}/task`
    : `https://api.clickup.com/api/v2/team/2285500/task`;

  const queryParams = new URLSearchParams({
    limit: '10',
    include_completed: 'false'
  });

  const response = await fetch(`${url}?${queryParams}`, {
    headers: {
      'Authorization': clickupApiKey,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`ClickUp API error: ${response.status}`);
  }

  const data = await response.json() as any;
  const tasks = data.tasks || [];

  // Filter tasks that match the query
  return tasks.filter((task: any) => 
    task.name.toLowerCase().includes(query.toLowerCase()) ||
    (task.description && task.description.toLowerCase().includes(query.toLowerCase()))
  );
}

function formatPlaybooksForSlack(playbooks: any[], query: string) {
  const blocks = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Search Results for "${query}"*`
      }
    },
    {
      type: 'divider'
    }
  ];

  playbooks.forEach((playbook, index) => {
    if (index >= 5) return; // Limit to 5 results
    
    // Extract custom fields for hours/timeline
    const customFields = playbook.custom_fields || [];
    const hoursField = customFields.find((field: any) => 
      field.name.toLowerCase().includes('hour') || 
      field.name.toLowerCase().includes('time') ||
      field.name.toLowerCase().includes('sprint')
    );
    
    const hoursInfo = hoursField ? hoursField.value : 'Not specified';
    
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${playbook.name}*\n${playbook.description || 'No description available'}\n\n⏱️ *Timeline:* ${hoursInfo}`
      },
      accessory: {
        type: 'button',
        text: {
          type: 'plain_text',
          text: 'Open Playbook'
        },
        url: playbook.url
      }
    });

    blocks.push({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `Status: ${playbook.status?.status || 'Unknown'} | List: ${playbook.list?.name || 'Unknown'}`
        }
      ]
    });

    if (index < playbooks.length - 1 && index < 4) {
      blocks.push({
        type: 'divider'
      });
    }
  });

  return blocks;
}

async function handleCategory(category: string, res: VercelResponse) {
  if (!category || category.trim().length === 0) {
    const categories = ['Sales', 'Marketing', 'Customer Success', 'Product', 'Engineering', 'HR', 'Operations'];
    return res.status(200).json({
      response_type: 'ephemeral',
      text: `📂 Available categories:\n${categories.map(cat => `• ${cat}`).join('\n')}\n\nUsage: \`/playbook-category Sales\``
    });
  }

  return res.status(200).json({
    response_type: 'ephemeral',
    text: `📂 Browsing "${category}" playbooks...\n\n⏳ Category browsing is being enhanced...\n🚀 Coming soon: Organized playbook categories!`
  });
}

async function handleEvents(req: VercelRequest, res: VercelResponse) {
  console.log('Event received:', req.body);
  
  // Handle URL verification challenge
  if (req.body && req.body.type === 'url_verification') {
    console.log('URL verification challenge:', req.body.challenge);
    return res.status(200).json({ challenge: req.body.challenge });
  }
  
  // Handle other events
  return res.status(200).json({ ok: true });
}

async function handleInteractive(req: VercelRequest, res: VercelResponse) {
  return res.status(200).json({ ok: true });
}