import { logger } from './logger';

interface MetricData {
  name: string;
  value: number;
  tags?: Record<string, string>;
  timestamp?: Date;
}

interface PerformanceMetric {
  operation: string;
  duration: number;
  success: boolean;
  error?: string;
  metadata?: Record<string, any>;
}

export class MonitoringService {
  private static instance: MonitoringService;
  private metrics: Map<string, MetricData[]> = new Map();
  private performanceData: PerformanceMetric[] = [];

  private constructor() {
    this.startPeriodicLogging();
  }

  static getInstance(): MonitoringService {
    if (!MonitoringService.instance) {
      MonitoringService.instance = new MonitoringService();
    }
    return MonitoringService.instance;
  }

  recordMetric(metric: MetricData): void {
    const key = metric.name;
    if (!this.metrics.has(key)) {
      this.metrics.set(key, []);
    }
    
    const metrics = this.metrics.get(key)!;
    metrics.push({
      ...metric,
      timestamp: metric.timestamp || new Date(),
    });

    // Keep only last 1000 metrics per type
    if (metrics.length > 1000) {
      metrics.splice(0, metrics.length - 1000);
    }
  }

  recordPerformance(performance: PerformanceMetric): void {
    this.performanceData.push({
      ...performance,
    });

    // Keep only last 500 performance records
    if (this.performanceData.length > 500) {
      this.performanceData.splice(0, this.performanceData.length - 500);
    }
  }

  async measureOperation<T>(
    operation: string,
    fn: () => Promise<T>,
    metadata?: Record<string, any>
  ): Promise<T> {
    const startTime = Date.now();
    let success = true;
    let error: string | undefined;

    try {
      const result = await fn();
      return result;
    } catch (err) {
      success = false;
      error = err instanceof Error ? err.message : 'Unknown error';
      throw err;
    } finally {
      const duration = Date.now() - startTime;
      
      this.recordPerformance({
        operation,
        duration,
        success,
        error,
        metadata,
      });

      this.recordMetric({
        name: `operation.${operation}.duration`,
        value: duration,
        tags: { success: success.toString() },
      });

      if (!success) {
        this.recordMetric({
          name: `operation.${operation}.errors`,
          value: 1,
          tags: { error: error || 'unknown' },
        });
      }
    }
  }

  incrementCounter(name: string, tags?: Record<string, string>): void {
    this.recordMetric({
      name,
      value: 1,
      tags,
    });
  }

  recordGauge(name: string, value: number, tags?: Record<string, string>): void {
    this.recordMetric({
      name,
      value,
      tags,
    });
  }

  recordHistogram(name: string, value: number, tags?: Record<string, string>): void {
    this.recordMetric({
      name,
      value,
      tags,
    });
  }

  getMetrics(name?: string): Record<string, MetricData[]> {
    if (name) {
      return { [name]: this.metrics.get(name) || [] };
    }
    return Object.fromEntries(this.metrics);
  }

  getPerformanceData(operation?: string): PerformanceMetric[] {
    if (operation) {
      return this.performanceData.filter(p => p.operation === operation);
    }
    return this.performanceData;
  }

  getAggregatedMetrics(name: string, timeWindow: number = 300000): {
    count: number;
    sum: number;
    avg: number;
    min: number;
    max: number;
  } {
    const metrics = this.metrics.get(name) || [];
    const cutoff = new Date(Date.now() - timeWindow);
    const recentMetrics = metrics.filter(m => m.timestamp! > cutoff);

    if (recentMetrics.length === 0) {
      return { count: 0, sum: 0, avg: 0, min: 0, max: 0 };
    }

    const values = recentMetrics.map(m => m.value);
    const sum = values.reduce((a, b) => a + b, 0);
    
    return {
      count: recentMetrics.length,
      sum,
      avg: sum / recentMetrics.length,
      min: Math.min(...values),
      max: Math.max(...values),
    };
  }

  getSystemHealth(): {
    status: 'healthy' | 'warning' | 'error';
    checks: Record<string, { status: string; details?: any }>;
  } {
    const checks: Record<string, { status: string; details?: any }> = {};
    let overallStatus: 'healthy' | 'warning' | 'error' = 'healthy';

    // Check error rates
    const errorMetrics = this.getAggregatedMetrics('operation.errors', 300000);
    const totalOps = this.getAggregatedMetrics('operation.duration', 300000);
    const errorRate = totalOps.count > 0 ? (errorMetrics.count / totalOps.count) * 100 : 0;

    if (errorRate > 10) {
      checks.error_rate = { status: 'error', details: { rate: errorRate } };
      overallStatus = 'error';
    } else if (errorRate > 5) {
      checks.error_rate = { status: 'warning', details: { rate: errorRate } };
      if (overallStatus === 'healthy') overallStatus = 'warning';
    } else {
      checks.error_rate = { status: 'healthy', details: { rate: errorRate } };
    }

    // Check response times
    const avgResponseTime = this.getAggregatedMetrics('operation.duration', 300000).avg;
    if (avgResponseTime > 5000) {
      checks.response_time = { status: 'error', details: { avg_ms: avgResponseTime } };
      overallStatus = 'error';
    } else if (avgResponseTime > 2000) {
      checks.response_time = { status: 'warning', details: { avg_ms: avgResponseTime } };
      if (overallStatus === 'healthy') overallStatus = 'warning';
    } else {
      checks.response_time = { status: 'healthy', details: { avg_ms: avgResponseTime } };
    }

    // Check memory usage
    const memUsage = process.memoryUsage();
    const memUsageMB = memUsage.heapUsed / 1024 / 1024;
    if (memUsageMB > 256) {
      checks.memory = { status: 'warning', details: { heap_used_mb: memUsageMB } };
      if (overallStatus === 'healthy') overallStatus = 'warning';
    } else {
      checks.memory = { status: 'healthy', details: { heap_used_mb: memUsageMB } };
    }

    return { status: overallStatus, checks };
  }

  private startPeriodicLogging(): void {
    setInterval(() => {
      const health = this.getSystemHealth();
      const recentErrors = this.getAggregatedMetrics('operation.errors', 300000);
      const recentOps = this.getAggregatedMetrics('operation.duration', 300000);

      logger.info('System health check', {
        health_status: health.status,
        error_count: recentErrors.count,
        operation_count: recentOps.count,
        avg_response_time: recentOps.avg,
        memory_usage: process.memoryUsage(),
      });

      if (health.status !== 'healthy') {
        logger.warn('System health issues detected', {
          status: health.status,
          checks: health.checks,
        });
      }
    }, 300000); // Every 5 minutes
  }

  clearMetrics(): void {
    this.metrics.clear();
    this.performanceData.length = 0;
  }
}

export const monitoring = MonitoringService.getInstance();

// Utility functions for common monitoring patterns
export const trackApiCall = async <T>(
  endpoint: string,
  fn: () => Promise<T>
): Promise<T> => {
  return monitoring.measureOperation(`api.${endpoint}`, fn);
};

export const trackDatabaseOperation = async <T>(
  operation: string,
  fn: () => Promise<T>
): Promise<T> => {
  return monitoring.measureOperation(`db.${operation}`, fn);
};

export const trackAIOperation = async <T>(
  operation: string,
  fn: () => Promise<T>
): Promise<T> => {
  return monitoring.measureOperation(`ai.${operation}`, fn);
};

export const trackSlackOperation = async <T>(
  operation: string,
  fn: () => Promise<T>
): Promise<T> => {
  return monitoring.measureOperation(`slack.${operation}`, fn);
};

export const trackClickUpOperation = async <T>(
  operation: string,
  fn: () => Promise<T>
): Promise<T> => {
  return monitoring.measureOperation(`clickup.${operation}`, fn);
};