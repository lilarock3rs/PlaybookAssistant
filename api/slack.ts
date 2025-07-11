import { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  const { pathname } = new URL(req.url || '', `http://${req.headers.host}`);
  
  // Route based on path
  if (pathname.includes('/commands')) {
    return handleCommands(req, res);
  } else if (pathname.includes('/events')) {
    return handleEvents(req, res);
  } else if (pathname.includes('/interactive')) {
    return handleInteractive(req, res);
  }
  
  res.status(404).json({ error: 'Not found' });
}

async function handleCommands(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  const { command, text } = req.body;
  
  switch (command) {
    case '/playbook-help':
      return res.status(200).json({
        response_type: 'ephemeral',
        text: `*Playbook AI Assistant Commands:*

• \`/playbook-search [query]\` - Search for relevant playbooks
• \`/playbook-category [category]\` - Browse playbooks by category  
• \`/playbook-sync\` - Synchronize playbooks from ClickUp
• \`/playbook-help\` - Show this help message

The bot is currently being set up. Full functionality will be available soon!`
      });
      
    default:
      return res.status(200).json({
        response_type: 'ephemeral',
        text: 'Bot is being configured. Use `/playbook-help` for available commands.'
      });
  }
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