import { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Simple database initialization
    const { sql } = await import('@vercel/postgres');
    
    // Create basic table
    await sql`CREATE EXTENSION IF NOT EXISTS vector`;
    
    await sql`
      CREATE TABLE IF NOT EXISTS playbooks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        clickup_id VARCHAR(255) UNIQUE NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        content TEXT NOT NULL,
        category VARCHAR(255),
        url TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `;

    res.status(200).json({
      success: true,
      message: 'Database initialized successfully'
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}// Force redeploy
