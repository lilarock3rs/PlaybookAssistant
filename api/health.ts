import { VercelRequest, VercelResponse } from '@vercel/node';
import { monitoring } from '../utils/monitoring';
import { rateLimiter } from '../utils/rate-limiter';
import { Cache } from '../utils/cache';
import { ApiResponse } from '../types';
import { logger } from '../utils/logger';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const health = await getSystemHealth();
    const statusCode = health.status === 'healthy' ? 200 : health.status === 'warning' ? 200 : 503;
    
    const response: ApiResponse<typeof health> = {
      success: health.status !== 'error',
      data: health,
      message: `System status: ${health.status}`,
    };

    res.status(statusCode).json(response);
  } catch (error) {
    logger.error('Health check error:', error as Error);
    
    const response: ApiResponse<any> = {
      success: false,
      error: 'Health check failed',
    };

    res.status(503).json(response);
  }
}

async function getSystemHealth() {
  const startTime = Date.now();
  
  try {
    // Get basic health from monitoring service
    const baseHealth = monitoring.getSystemHealth();
    
    // Add additional checks
    const additionalChecks = await Promise.all([
      checkDatabaseConnection(),
      checkExternalServices(),
      checkSystemResources(),
    ]);

    const allChecks = {
      ...baseHealth.checks,
      database: additionalChecks[0],
      external_services: additionalChecks[1],
      system_resources: additionalChecks[2],
    };

    // Determine overall status
    let overallStatus = baseHealth.status;
    const hasError = Object.values(allChecks).some(check => check.status === 'error');
    const hasWarning = Object.values(allChecks).some(check => check.status === 'warning');

    if (hasError) {
      overallStatus = 'error';
    } else if (hasWarning && overallStatus === 'healthy') {
      overallStatus = 'warning';
    }

    return {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      uptime: process.uptime(),
      checks: allChecks,
      performance: {
        health_check_duration: Date.now() - startTime,
        recent_metrics: monitoring.getAggregatedMetrics('operation.duration', 300000),
        cache_stats: getCacheStats(),
        rate_limiter_stats: rateLimiter.getStats(),
      },
    };
  } catch (error) {
    logger.error('System health check failed:', error as Error);
    return {
      status: 'error' as const,
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      uptime: process.uptime(),
      checks: {
        health_check: { 
          status: 'error', 
          details: { error: error instanceof Error ? error.message : 'Unknown error' }
        },
      },
      performance: {
        health_check_duration: Date.now() - startTime,
      },
    };
  }
}

async function checkDatabaseConnection(): Promise<{ status: string; details?: any }> {
  try {
    // Try to import and test database connection
    const { sql } = await import('@vercel/postgres');
    const result = await sql`SELECT 1 as test`;
    
    if (result.rows.length > 0 && result.rows[0].test === 1) {
      return { status: 'healthy', details: { connection: 'ok' } };
    } else {
      return { status: 'error', details: { connection: 'failed' } };
    }
  } catch (error) {
    return { 
      status: 'error', 
      details: { 
        connection: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    };
  }
}

async function checkExternalServices(): Promise<{ status: string; details?: any }> {
  const services = ['slack', 'clickup', 'google'];
  const results: Record<string, any> = {};

  // Check if API keys are configured
  const apiKeys = {
    slack: process.env.SLACK_BOT_TOKEN,
    clickup: process.env.CLICKUP_API_KEY,
    google: process.env.GOOGLE_API_KEY,
  };

  let hasError = false;
  let hasWarning = false;

  for (const service of services) {
    if (!apiKeys[service as keyof typeof apiKeys]) {
      results[service] = { status: 'error', details: { error: 'API key not configured' } };
      hasError = true;
    } else {
      results[service] = { status: 'healthy', details: { api_key: 'configured' } };
    }
  }

  // Check recent operation success rates
  const recentErrors = monitoring.getAggregatedMetrics('operation.errors', 300000);
  const recentOps = monitoring.getAggregatedMetrics('operation.duration', 300000);
  
  if (recentOps.count > 0) {
    const errorRate = (recentErrors.count / recentOps.count) * 100;
    if (errorRate > 20) {
      hasError = true;
    } else if (errorRate > 10) {
      hasWarning = true;
    }
    
    results.operation_health = {
      status: errorRate > 20 ? 'error' : errorRate > 10 ? 'warning' : 'healthy',
      details: { error_rate: errorRate, total_operations: recentOps.count }
    };
  }

  const overallStatus = hasError ? 'error' : hasWarning ? 'warning' : 'healthy';
  
  return { status: overallStatus, details: results };
}

async function checkSystemResources(): Promise<{ status: string; details?: any }> {
  const memUsage = process.memoryUsage();
  const memUsageMB = memUsage.heapUsed / 1024 / 1024;
  const memLimitMB = 512; // Vercel function memory limit
  const memPercentage = (memUsageMB / memLimitMB) * 100;

  let status = 'healthy';
  if (memPercentage > 90) {
    status = 'error';
  } else if (memPercentage > 75) {
    status = 'warning';
  }

  const details = {
    memory: {
      used_mb: Math.round(memUsageMB * 100) / 100,
      percentage: Math.round(memPercentage * 100) / 100,
      heap_total_mb: Math.round((memUsage.heapTotal / 1024 / 1024) * 100) / 100,
      external_mb: Math.round((memUsage.external / 1024 / 1024) * 100) / 100,
    },
    uptime: process.uptime(),
    node_version: process.version,
    platform: process.platform,
  };

  return { status, details };
}

function getCacheStats(): Record<string, any> {
  try {
    // Get cache instance statistics if available
    const embedCache = Cache.getInstance('embeddings');
    const searchCache = Cache.getInstance('search');
    const playbookCache = Cache.getInstance('playbooks');

    return {
      embeddings: { size: embedCache.size() },
      search: { size: searchCache.size() },
      playbooks: { size: playbookCache.size() },
    };
  } catch (error) {
    return { error: 'Could not retrieve cache stats' };
  }
}