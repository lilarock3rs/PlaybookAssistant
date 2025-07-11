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
        url: `https://app.clickup.com/${workspaceId}/v/dc/${doc.id}`,
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
        url: `https://app.clickup.com/${workspaceId}/v/dc/${doc.id}`,
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
  
  // Use the pages endpoint to get specific page details
  const pagesUrl = `https://api.clickup.com/api/v3/workspaces/${workspaceId}/docs/${docId}/pages`;
  
  const response = await fetch(pagesUrl, {
    headers: {
      'Authorization': apiKey,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    console.log(`Pages API error: ${response.status} ${response.statusText}`);
    const errorText = await response.text();
    console.log('Error response:', errorText);
    throw new Error(`Pages API error: ${response.status} - ${errorText}`);
  }

  const pagesData = await response.json() as any;
  console.log('Pages API response structure:', Object.keys(pagesData));
  
  const pages = pagesData.pages || pagesData || [];
  console.log('Available pages count:', pages.length);
  console.log('Available page names:', pages.map((p: any) => p.name || 'unnamed'));
  
  let description = 'No description available';
  let timeline = 'Not specified';

  // Search for "primer" page in the pages
  const primerPage = pages.find((page: any) => {
    if (!page.name) return false;
    const pageName = page.name.toLowerCase();
    console.log('Checking page:', pageName);
    return pageName.includes('primer') || pageName.includes('prime');
  });

  if (primerPage) {
    console.log('Found primer page:', primerPage.name);
    console.log('Primer page structure:', Object.keys(primerPage));
    
    // Extract description from primer page
    if (primerPage.description) {
      // If there's a direct description field, use first 100 words
      const words = primerPage.description.split(/\s+/);
      description = words.slice(0, 100).join(' ');
      if (words.length > 100) description += '...';
      console.log('Using primer page description field:', description);
    } else if (primerPage.content) {
      // Extract from content
      description = extractDescriptionFromContent(primerPage.content);
      console.log('Extracted from primer page content:', description);
    }
    
    // Extract timeline from primer page
    const contentToSearch = primerPage.content || primerPage.description || '';
    timeline = extractTimelineFromContent(contentToSearch);
    console.log('Extracted timeline:', timeline);
    
  } else {
    console.log('No primer page found');
    console.log('All available pages:', pages.map((p: any) => ({ 
      name: p.name, 
      hasDescription: !!p.description,
      hasContent: !!p.content 
    })));
    
    // Fallback: try to find any page with useful content
    const contentPage = pages.find((p: any) => p.description || p.content);
    if (contentPage) {
      console.log('Using fallback page:', contentPage.name);
      const content = contentPage.description || contentPage.content || '';
      description = extractDescriptionFromContent(content);
      timeline = extractTimelineFromContent(content);
    }
  }

  console.log('Final extracted description:', description);
  console.log('Final extracted timeline:', timeline);

  return { description, timeline };
}

function extractDescriptionFromContent(content: string): string {
  console.log('Extracting description from content length:', content.length);
  
  // Remove HTML tags but keep some structure for parsing
  let cleanContent = content.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  console.log('Clean content preview:', cleanContent.substring(0, 500));
  
  // First, look for "Definition" section with improved boundary detection
  const definitionMatch = cleanContent.match(/Definition[:\s]*(.+?)(?=\s*(?:Timeline|Estimated Timeline|Key Components|Implementation|Steps|Overview|Purpose|Benefits|Objectives|Requirements|Notes|$))/i);
  if (definitionMatch && definitionMatch[1]) {
    const definitionSection = definitionMatch[1].trim();
    console.log('Found Definition section:', definitionSection.substring(0, 200));
    
    // Within the Definition section, look for "What is..." pattern with better boundary handling
    const whatIsMatch = definitionSection.match(/What is[^?]*\?\s*([^.]+(?:\.[^.]*)*?)(?=\s*(?:Timeline|Estimated Timeline|Key Components|Implementation|Steps|Overview|$|\.(?:\s*[A-Z])))/i);
    if (whatIsMatch && whatIsMatch[1]) {
      const description = whatIsMatch[1].trim();
      // Get first 100 characters as requested
      const result = description.length > 100 ? description.substring(0, 100) + '...' : description;
      console.log('Found "What is..." in Definition section:', result);
      return result;
    }
    
    // Alternative: look for text immediately after "What is [question]?" pattern
    const simpleWhatIsMatch = definitionSection.match(/What is[^?]*\?\s*(.{1,200}?)(?=\s*(?:Timeline|Key Components|Implementation|Steps|$))/i);
    if (simpleWhatIsMatch && simpleWhatIsMatch[1]) {
      const description = simpleWhatIsMatch[1].trim();
      const result = description.length > 100 ? description.substring(0, 100) + '...' : description;
      console.log('Found simple "What is..." pattern:', result);
      return result;
    }
    
    // If no "What is..." found in Definition, use the Definition content itself (first sentence or 100 chars)
    const firstSentence = definitionSection.match(/^([^.]+)/);
    if (firstSentence && firstSentence[1]) {
      const description = firstSentence[1].trim();
      const result = description.length > 100 ? description.substring(0, 100) + '...' : description;
      console.log('Using first sentence of Definition section:', result);
      return result;
    }
    
    const result = definitionSection.length > 100 ? definitionSection.substring(0, 100) + '...' : definitionSection;
    console.log('Using Definition section content:', result);
    return result;
  }
  
  // Fallback: Look for "What is..." anywhere in the content with improved boundaries
  const globalWhatIsMatch = cleanContent.match(/What is[^?]*\?\s*([^.]+(?:\.[^.]*)*?)(?=\s*(?:Timeline|Estimated Timeline|Key Components|Implementation|Steps|Overview|$|\.(?:\s*[A-Z])))/i);
  if (globalWhatIsMatch && globalWhatIsMatch[1]) {
    const description = globalWhatIsMatch[1].trim();
    const result = description.length > 100 ? description.substring(0, 100) + '...' : description;
    console.log('Found global "What is..." description:', result);
    return result;
  }
  
  // Alternative patterns to look for with improved boundaries
  const patterns = [
    /Definition[:\s]*(.+?)(?=\s*(?:Timeline|Estimated Timeline|Key Components|Implementation|Steps|Overview|$))/i,
    /Description[:\s]*(.+?)(?=\s*(?:Timeline|Estimated Timeline|Key Components|Implementation|Steps|Overview|$))/i,
    /Overview[:\s]*(.+?)(?=\s*(?:Timeline|Estimated Timeline|Key Components|Implementation|Steps|Definition|$))/i,
    /Purpose[:\s]*(.+?)(?=\s*(?:Timeline|Estimated Timeline|Key Components|Implementation|Steps|Overview|$))/i
  ];
  
  for (const pattern of patterns) {
    const match = cleanContent.match(pattern);
    if (match && match[1] && match[1].trim().length > 10) {
      const description = match[1].trim();
      // Get first sentence or 100 characters
      const firstSentence = description.match(/^([^.]+)/);
      if (firstSentence && firstSentence[1] && firstSentence[1].trim().length > 10) {
        const result = firstSentence[1].trim();
        const finalResult = result.length > 100 ? result.substring(0, 100) + '...' : result;
        console.log('Found description with pattern:', pattern.source, '→', finalResult);
        return finalResult;
      }
      
      const result = description.length > 100 ? description.substring(0, 100) + '...' : description;
      console.log('Found description with pattern (full):', pattern.source, '→', result);
      return result;
    }
  }
  
  // Fallback: get first 100 characters of meaningful content
  if (cleanContent.length > 20) {
    const result = cleanContent.length > 100 ? cleanContent.substring(0, 100) + '...' : cleanContent;
    console.log('Using fallback description (first 100 chars):', result);
    return result;
  }
  
  console.log('No description found, returning default');
  return 'No description available';
}

function extractTimelineFromContent(content: string): string {
  console.log('Extracting timeline from content length:', content.length);
  
  // Remove HTML tags for cleaner matching
  const cleanContent = content.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  
  // Look for specific timeline patterns with improved boundary detection
  const timelinePatterns = [
    /estimated\s+timeline[:\s]*(.+?)(?=\s*(?:Key Components|Implementation|Steps|Overview|Definition|Benefits|Objectives|Requirements|Notes|$))/i,
    /timeline[:\s]*(.+?)(?=\s*(?:Key Components|Implementation|Steps|Overview|Definition|Benefits|Objectives|Requirements|Notes|$))/i,
    /estimated\s+time[:\s]*(.+?)(?=\s*(?:Key Components|Implementation|Steps|Overview|Definition|Benefits|Objectives|Requirements|Notes|$))/i,
    /duration[:\s]*(.+?)(?=\s*(?:Key Components|Implementation|Steps|Overview|Definition|Benefits|Objectives|Requirements|Notes|$))/i,
    /time\s+required[:\s]*(.+?)(?=\s*(?:Key Components|Implementation|Steps|Overview|Definition|Benefits|Objectives|Requirements|Notes|$))/i,
    /hours?[:\s]*(.+?)(?=\s*(?:Key Components|Implementation|Steps|Overview|Definition|Benefits|Objectives|Requirements|Notes|$))/i,
    /sprint[s]?[:\s]*(.+?)(?=\s*(?:Key Components|Implementation|Steps|Overview|Definition|Benefits|Objectives|Requirements|Notes|$))/i,
    /weeks?[:\s]*(.+?)(?=\s*(?:Key Components|Implementation|Steps|Overview|Definition|Benefits|Objectives|Requirements|Notes|$))/i,
    /days?[:\s]*(.+?)(?=\s*(?:Key Components|Implementation|Steps|Overview|Definition|Benefits|Objectives|Requirements|Notes|$))/i
  ];

  for (const pattern of timelinePatterns) {
    const match = cleanContent.match(pattern);
    if (match && match[1]) {
      const timeline = match[1].trim();
      // Clean up the timeline to remove extra text
      const cleanTimeline = timeline.replace(/\s*(?:Key Components|Implementation|Steps|Overview|Definition|Benefits|Objectives|Requirements|Notes).*$/i, '').trim();
      console.log('Found timeline with pattern:', pattern.source, '→', cleanTimeline);
      return cleanTimeline;
    }
  }

  // Look for any number followed by time units anywhere in content
  const numberTimePattern = /(\d+[-\s]*(?:to|-)?\s*\d*\s*(?:hour|day|week|month|sprint)s?)/i;
  const numberMatch = cleanContent.match(numberTimePattern);
  if (numberMatch) {
    console.log('Found number-based timeline:', numberMatch[1]);
    return numberMatch[1];
  }

  // Look for common time expressions
  const timeExpressions = [
    /(\d+[-\s]*(?:to|-)?\s*\d*\s*(?:hrs?|days?|weeks?|months?))/i,
    /(quick|fast|rapid)\s+(?:implementation|setup)/i,
    /(long[- ]?term|short[- ]?term)/i,
    /(\d+\s*sprints?)/i,
    /(immediate|ongoing|continuous)/i
  ];

  for (const pattern of timeExpressions) {
    const match = cleanContent.match(pattern);
    if (match && match[1]) {
      console.log('Found time expression:', match[1]);
      return match[1];
    }
  }

  console.log('No timeline pattern found');
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