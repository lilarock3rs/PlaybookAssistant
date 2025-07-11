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
  const workspaceId = process.env.CLICKUP_WORKSPACE_ID || '2285500';
  const parentId = process.env.CLICKUP_PLAYBOOKS_FOLDER_ID || '98107928';
  
  if (!clickupApiKey) {
    throw new Error('ClickUp API key not configured');
  }

  console.log('Searching docs with:', { workspaceId, parentId, query });

  // Get all documents from the workspace with parent_id filter
  const docsUrl = `https://api.clickup.com/api/v3/workspaces/${workspaceId}/docs`;
  const queryParams = new URLSearchParams({
    deleted: 'false',
    archived: 'false',
    limit: '50',
    parent_id: parentId
  });

  const response = await fetch(`${docsUrl}?${queryParams}`, {
    headers: {
      'Authorization': clickupApiKey,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`ClickUp Docs API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as any;
  console.log('Docs API response:', data);
  
  const docs = data.docs || [];

  // Filter documents that match the query
  const matchingDocs = docs.filter((doc: any) => 
    doc.name.toLowerCase().includes(query.toLowerCase())
  );

  console.log('Matching docs:', matchingDocs.length);

  // Get detailed info for each matching document
  const detailedPlaybooks = [];
  for (const doc of matchingDocs.slice(0, 5)) { // Limit to 5 results
    try {
      const docDetails = await getDocumentDetails(doc.id, workspaceId, clickupApiKey);
      detailedPlaybooks.push({
        id: doc.id,
        name: doc.name,
        url: `https://app.clickup.com/doc/${doc.id}`,
        description: docDetails.description,
        timeline: docDetails.timeline,
        created_at: doc.created_at,
        updated_at: doc.updated_at
      });
    } catch (error) {
      console.error(`Error getting details for doc ${doc.id}:`, error);
      // Add basic info even if detailed fetch fails
      detailedPlaybooks.push({
        id: doc.id,
        name: doc.name,
        url: `https://app.clickup.com/doc/${doc.id}`,
        description: 'Could not fetch description',
        timeline: 'Not specified',
        created_at: doc.created_at,
        updated_at: doc.updated_at
      });
    }
  }

  return detailedPlaybooks;
}

async function getDocumentDetails(docId: string, workspaceId: string, apiKey: string) {
  console.log('Getting document details for:', docId);
  
  const docUrl = `https://api.clickup.com/api/v3/workspaces/${workspaceId}/docs/${docId}`;
  
  const response = await fetch(docUrl, {
    headers: {
      'Authorization': apiKey,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`Document API error: ${response.status}`);
  }

  const docData = await response.json() as any;
  console.log('Document data structure:', Object.keys(docData));
  
  // Look for "primer" page in the document content
  const pages = docData.pages || [];
  console.log('Document pages:', pages.length);
  
  let description = 'No description available';
  let timeline = 'Not specified';

  // Search for "primer" page
  const primerPage = pages.find((page: any) => 
    page.name && page.name.toLowerCase().includes('primer')
  );

  if (primerPage) {
    console.log('Found primer page:', primerPage.name);
    
    // Extract description and timeline from primer page content
    const content = primerPage.content || '';
    
    // Try to extract description (assuming it's in the content)
    description = extractDescriptionFromContent(content);
    timeline = extractTimelineFromContent(content);
  } else {
    console.log('No primer page found, available pages:', pages.map((p: any) => p.name));
    
    // Fallback: use document description if available
    if (docData.description) {
      description = docData.description;
    }
  }

  return { description, timeline };
}

function extractDescriptionFromContent(content: string): string {
  // Remove HTML tags and get first meaningful paragraph
  const cleanContent = content.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  
  // Get first 200 characters as description
  if (cleanContent.length > 200) {
    return cleanContent.substring(0, 200) + '...';
  }
  
  return cleanContent || 'No description available';
}

function extractTimelineFromContent(content: string): string {
  // Look for common timeline patterns
  const timelinePatterns = [
    /timeline[:\s]*([^<\n]*)/i,
    /hours?[:\s]*([^<\n]*)/i,
    /sprint[s]?[:\s]*([^<\n]*)/i,
    /duration[:\s]*([^<\n]*)/i,
    /time[:\s]*([^<\n]*)/i
  ];

  for (const pattern of timelinePatterns) {
    const match = content.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }

  return 'Not specified';
}

function formatPlaybooksForSlack(playbooks: any[], query: string) {
  const blocks = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*🔍 Search Results for "${query}"*\nFound ${playbooks.length} playbook(s)`
      }
    },
    {
      type: 'divider'
    }
  ];

  playbooks.forEach((playbook, index) => {
    if (index >= 5) return; // Limit to 5 results
    
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*📖 ${playbook.name}*\n${playbook.description}\n\n⏱️ *Timeline:* ${playbook.timeline}`
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
          text: `📅 Updated: ${new Date(playbook.updated_at).toLocaleDateString()} | ID: ${playbook.id}`
        }
      ]
    });

    if (index < playbooks.length - 1 && index < 4) {
      blocks.push({
        type: 'divider'
      });
    }
  });

  // Add footer with search tips
  blocks.push({
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: 'ℹ️ _Try different keywords if you don\'t find what you\'re looking for_'
      }
    ]
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