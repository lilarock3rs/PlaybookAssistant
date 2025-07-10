import { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from '@vercel/postgres';
import { ApiResponse } from '../../types';
import { logger } from '../../utils/logger';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    res.status(405).json({ success: false, error: 'Method not allowed' });
    return;
  }

  try {
    const analytics = await generateAnalytics();

    const response: ApiResponse<typeof analytics> = {
      success: true,
      data: analytics,
      message: 'Analytics generated successfully',
    };

    res.status(200).json(response);
  } catch (error) {
    logger.error('Analytics error:', error as Error);
    
    const response: ApiResponse<any> = {
      success: false,
      error: error instanceof Error ? error.message : 'Analytics generation failed',
    };

    res.status(500).json(response);
  }
}

async function generateAnalytics() {
  try {
    const [
      totalPlaybooks,
      categoryCounts,
      recentActivity,
      syncStats,
      embeddingStats,
    ] = await Promise.all([
      getTotalPlaybooks(),
      getCategoryCounts(),
      getRecentActivity(),
      getSyncStats(),
      getEmbeddingStats(),
    ]);

    return {
      overview: {
        total_playbooks: totalPlaybooks,
        categories_count: categoryCounts.length,
        recent_syncs: syncStats.recent_syncs,
        last_sync: syncStats.last_sync,
      },
      categories: categoryCounts,
      recent_activity: recentActivity,
      sync_performance: syncStats,
      embedding_coverage: embeddingStats,
      health_status: calculateHealthStatus({
        total_playbooks: totalPlaybooks,
        embedding_coverage: embeddingStats.coverage_percentage,
        recent_sync_success: syncStats.last_sync_success,
      }),
    };
  } catch (error) {
    logger.error('Error generating analytics:', error as Error);
    throw error;
  }
}

async function getTotalPlaybooks(): Promise<number> {
  const result = await sql`SELECT COUNT(*) as count FROM playbooks`;
  return parseInt(result.rows[0].count, 10);
}

async function getCategoryCounts(): Promise<Array<{ category: string; count: number }>> {
  const result = await sql`
    SELECT category, COUNT(*) as count 
    FROM playbooks 
    WHERE category IS NOT NULL 
    GROUP BY category 
    ORDER BY count DESC
  `;
  
  return result.rows.map(row => ({
    category: row.category,
    count: parseInt(row.count, 10),
  }));
}

async function getRecentActivity(): Promise<Array<{
  date: string;
  created: number;
  updated: number;
}>> {
  const result = await sql`
    SELECT 
      DATE(created_at) as date,
      COUNT(CASE WHEN created_at = updated_at THEN 1 END) as created,
      COUNT(CASE WHEN created_at != updated_at THEN 1 END) as updated
    FROM playbooks 
    WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
    GROUP BY DATE(created_at)
    ORDER BY date DESC
    LIMIT 30
  `;

  return result.rows.map(row => ({
    date: row.date,
    created: parseInt(row.created, 10),
    updated: parseInt(row.updated, 10),
  }));
}

async function getSyncStats(): Promise<{
  recent_syncs: number;
  last_sync: string | null;
  last_sync_success: boolean;
  total_synced_today: number;
  average_sync_time: number;
}> {
  const [recentSyncs, lastSync, todayStats, avgTime] = await Promise.all([
    sql`
      SELECT COUNT(*) as count 
      FROM sync_logs 
      WHERE started_at >= CURRENT_DATE - INTERVAL '7 days'
    `,
    sql`
      SELECT status, started_at, completed_at
      FROM sync_logs 
      ORDER BY started_at DESC 
      LIMIT 1
    `,
    sql`
      SELECT 
        SUM(synced_count + updated_count) as total_today
      FROM sync_logs 
      WHERE DATE(started_at) = CURRENT_DATE
    `,
    sql`
      SELECT 
        AVG(EXTRACT(EPOCH FROM (completed_at - started_at))) as avg_seconds
      FROM sync_logs 
      WHERE completed_at IS NOT NULL 
        AND started_at >= CURRENT_DATE - INTERVAL '30 days'
    `,
  ]);

  const lastSyncData = lastSync.rows[0];
  
  return {
    recent_syncs: parseInt(recentSyncs.rows[0].count, 10),
    last_sync: lastSyncData?.started_at || null,
    last_sync_success: lastSyncData?.status === 'completed',
    total_synced_today: parseInt(todayStats.rows[0].total_today || '0', 10),
    average_sync_time: parseFloat(avgTime.rows[0].avg_seconds || '0'),
  };
}

async function getEmbeddingStats(): Promise<{
  total_with_embeddings: number;
  total_without_embeddings: number;
  coverage_percentage: number;
}> {
  const result = await sql`
    SELECT 
      COUNT(CASE WHEN embedding IS NOT NULL THEN 1 END) as with_embeddings,
      COUNT(CASE WHEN embedding IS NULL THEN 1 END) as without_embeddings,
      COUNT(*) as total
    FROM playbooks
  `;

  const row = result.rows[0];
  const withEmbeddings = parseInt(row.with_embeddings, 10);
  const withoutEmbeddings = parseInt(row.without_embeddings, 10);
  const total = parseInt(row.total, 10);
  
  return {
    total_with_embeddings: withEmbeddings,
    total_without_embeddings: withoutEmbeddings,
    coverage_percentage: total > 0 ? (withEmbeddings / total) * 100 : 0,
  };
}

function calculateHealthStatus(metrics: {
  total_playbooks: number;
  embedding_coverage: number;
  recent_sync_success: boolean;
}): {
  status: 'healthy' | 'warning' | 'error';
  issues: string[];
  score: number;
} {
  const issues: string[] = [];
  let score = 100;

  if (metrics.total_playbooks === 0) {
    issues.push('No playbooks found');
    score -= 50;
  }

  if (metrics.embedding_coverage < 80) {
    issues.push(`Low embedding coverage: ${Math.round(metrics.embedding_coverage)}%`);
    score -= 20;
  }

  if (!metrics.recent_sync_success) {
    issues.push('Last sync failed');
    score -= 30;
  }

  let status: 'healthy' | 'warning' | 'error';
  if (score >= 80) {
    status = 'healthy';
  } else if (score >= 60) {
    status = 'warning';
  } else {
    status = 'error';
  }

  return { status, issues, score };
}