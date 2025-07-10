import { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from '@vercel/postgres';
import { ApiResponse } from '../../types';

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
    await sql`CREATE EXTENSION IF NOT EXISTS vector`;
    
    await sql`
      CREATE TABLE IF NOT EXISTS playbooks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        clickup_id VARCHAR(255) UNIQUE NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        content TEXT NOT NULL,
        category VARCHAR(255),
        tags TEXT[],
        url TEXT NOT NULL,
        embedding vector(768),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS playbooks_clickup_id_idx 
      ON playbooks (clickup_id)
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS playbooks_category_idx 
      ON playbooks (category)
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS playbooks_embedding_idx 
      ON playbooks USING ivfflat (embedding vector_cosine_ops)
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS playbooks_updated_at_idx 
      ON playbooks (updated_at DESC)
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS sync_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        sync_type VARCHAR(50) NOT NULL,
        status VARCHAR(20) NOT NULL,
        synced_count INTEGER DEFAULT 0,
        updated_count INTEGER DEFAULT 0,
        error_count INTEGER DEFAULT 0,
        errors TEXT[],
        started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP WITH TIME ZONE
      )
    `;

    const response: ApiResponse<string> = {
      success: true,
      message: 'Database initialized successfully',
    };

    res.status(200).json(response);
  } catch (error) {
    console.error('Database initialization error:', error);
    
    const response: ApiResponse<string> = {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };

    res.status(500).json(response);
  }
}