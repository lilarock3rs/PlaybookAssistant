import { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    checks: {
      database: process.env.DATABASE_URL ? 'configured' : 'missing',
      slack: process.env.SLACK_BOT_TOKEN ? 'configured' : 'missing',
      clickup: process.env.CLICKUP_API_KEY ? 'configured' : 'missing',
      google: process.env.GOOGLE_API_KEY ? 'configured' : 'missing',
    }
  };

  res.status(200).json({
    success: true,
    data: health
  });
}