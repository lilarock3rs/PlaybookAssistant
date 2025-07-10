import { sql } from '@vercel/postgres';
import { Playbook, PlaybookSearchResult, SearchQuery, SyncResult } from '../types';

export class DatabaseClient {
  async insertPlaybook(playbook: Omit<Playbook, 'id' | 'created_at' | 'updated_at'>): Promise<string> {
    try {
      const result = await sql`
        INSERT INTO playbooks (
          clickup_id, title, description, content, category, tags, url, embedding
        ) VALUES (
          ${playbook.clickup_id},
          ${playbook.title},
          ${playbook.description || ''},
          ${playbook.content},
          ${playbook.category || 'General'},
          ${playbook.tags || []},
          ${playbook.url},
          ${playbook.embedding ? `[${playbook.embedding.join(',')}]` : null}
        )
        ON CONFLICT (clickup_id) DO UPDATE SET
          title = EXCLUDED.title,
          description = EXCLUDED.description,
          content = EXCLUDED.content,
          category = EXCLUDED.category,
          tags = EXCLUDED.tags,
          url = EXCLUDED.url,
          embedding = EXCLUDED.embedding,
          updated_at = CURRENT_TIMESTAMP
        RETURNING id
      `;

      return result.rows[0].id;
    } catch (error) {
      console.error('Error inserting playbook:', error);
      throw error;
    }
  }

  async getPlaybook(id: string): Promise<Playbook | null> {
    try {
      const result = await sql`
        SELECT * FROM playbooks WHERE id = ${id}
      `;

      if (result.rows.length === 0) {
        return null;
      }

      return this.mapRowToPlaybook(result.rows[0]);
    } catch (error) {
      console.error('Error fetching playbook:', error);
      throw error;
    }
  }

  async getPlaybookByClickUpId(clickupId: string): Promise<Playbook | null> {
    try {
      const result = await sql`
        SELECT * FROM playbooks WHERE clickup_id = ${clickupId}
      `;

      if (result.rows.length === 0) {
        return null;
      }

      return this.mapRowToPlaybook(result.rows[0]);
    } catch (error) {
      console.error('Error fetching playbook by ClickUp ID:', error);
      throw error;
    }
  }

  async searchPlaybooks(query: SearchQuery): Promise<PlaybookSearchResult[]> {
    try {
      const { category, limit = 5, threshold = 0.7 } = query;
      
      let baseQuery = `
        SELECT *, 
               (1 - (embedding <=> $1::vector)) AS similarity_score
        FROM playbooks 
        WHERE embedding IS NOT NULL
      `;
      
      const params: any[] = [`[${query.query}]`];
      let paramIndex = 2;

      if (category) {
        baseQuery += ` AND category = $${paramIndex}`;
        params.push(category);
        paramIndex++;
      }

      baseQuery += ` 
        AND (1 - (embedding <=> $1::vector)) > $${paramIndex}
        ORDER BY similarity_score DESC
        LIMIT $${paramIndex + 1}
      `;
      
      params.push(threshold, limit);

      const result = await sql.query(baseQuery, params);

      return result.rows.map(row => ({
        playbook: this.mapRowToPlaybook(row),
        similarity_score: parseFloat(row.similarity_score),
      }));
    } catch (error) {
      console.error('Error searching playbooks:', error);
      throw error;
    }
  }

  async searchPlaybooksByEmbedding(embedding: number[], options: {
    category?: string;
    limit?: number;
    threshold?: number;
  } = {}): Promise<PlaybookSearchResult[]> {
    try {
      const { category, limit = 5, threshold = 0.7 } = options;
      
      let baseQuery = `
        SELECT *, 
               (1 - (embedding <=> $1::vector)) AS similarity_score
        FROM playbooks 
        WHERE embedding IS NOT NULL
      `;
      
      const params: any[] = [`[${embedding.join(',')}]`];
      let paramIndex = 2;

      if (category) {
        baseQuery += ` AND category = $${paramIndex}`;
        params.push(category);
        paramIndex++;
      }

      baseQuery += ` 
        AND (1 - (embedding <=> $1::vector)) > $${paramIndex}
        ORDER BY similarity_score DESC
        LIMIT $${paramIndex + 1}
      `;
      
      params.push(threshold, limit);

      const result = await sql.query(baseQuery, params);

      return result.rows.map(row => ({
        playbook: this.mapRowToPlaybook(row),
        similarity_score: parseFloat(row.similarity_score),
      }));
    } catch (error) {
      console.error('Error searching playbooks by embedding:', error);
      throw error;
    }
  }

  async getAllPlaybooks(options: {
    category?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<Playbook[]> {
    try {
      const { category, limit = 100, offset = 0 } = options;
      
      let query = 'SELECT * FROM playbooks';
      const params: any[] = [];
      let paramIndex = 1;

      if (category) {
        query += ` WHERE category = $${paramIndex}`;
        params.push(category);
        paramIndex++;
      }

      query += ` ORDER BY updated_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
      params.push(limit, offset);

      const result = await sql.query(query, params);

      return result.rows.map(row => this.mapRowToPlaybook(row));
    } catch (error) {
      console.error('Error fetching all playbooks:', error);
      throw error;
    }
  }

  async getCategories(): Promise<string[]> {
    try {
      const result = await sql`
        SELECT DISTINCT category 
        FROM playbooks 
        WHERE category IS NOT NULL 
        ORDER BY category
      `;

      return result.rows.map(row => row.category);
    } catch (error) {
      console.error('Error fetching categories:', error);
      throw error;
    }
  }

  async deletePlaybook(id: string): Promise<void> {
    try {
      await sql`DELETE FROM playbooks WHERE id = ${id}`;
    } catch (error) {
      console.error('Error deleting playbook:', error);
      throw error;
    }
  }

  async logSync(syncResult: SyncResult): Promise<void> {
    try {
      await sql`
        INSERT INTO sync_logs (
          sync_type, status, synced_count, updated_count, error_count, errors, completed_at
        ) VALUES (
          'clickup',
          ${syncResult.success ? 'completed' : 'failed'},
          ${syncResult.synced_count},
          ${syncResult.updated_count},
          ${syncResult.error_count},
          ${syncResult.errors || []},
          CURRENT_TIMESTAMP
        )
      `;
    } catch (error) {
      console.error('Error logging sync:', error);
    }
  }

  async getRecentSyncLogs(limit: number = 10): Promise<any[]> {
    try {
      const result = await sql`
        SELECT * FROM sync_logs 
        ORDER BY started_at DESC 
        LIMIT ${limit}
      `;

      return result.rows;
    } catch (error) {
      console.error('Error fetching sync logs:', error);
      throw error;
    }
  }

  private mapRowToPlaybook(row: any): Playbook {
    return {
      id: row.id,
      clickup_id: row.clickup_id,
      title: row.title,
      description: row.description || '',
      content: row.content,
      category: row.category || 'General',
      tags: row.tags || [],
      url: row.url,
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at),
      embedding: row.embedding ? this.parseEmbedding(row.embedding) : undefined,
      similarity_score: row.similarity_score ? parseFloat(row.similarity_score) : undefined,
    };
  }

  private parseEmbedding(embedding: string | number[]): number[] {
    if (Array.isArray(embedding)) {
      return embedding;
    }
    
    try {
      return JSON.parse(embedding);
    } catch {
      return [];
    }
  }
}