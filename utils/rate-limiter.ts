interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

export class RateLimiter {
  private static instance: RateLimiter;
  private limits: Map<string, RateLimitEntry> = new Map();
  private configs: Map<string, RateLimitConfig> = new Map();

  private constructor() {
    this.setupDefaultConfigs();
    this.startCleanupTimer();
  }

  static getInstance(): RateLimiter {
    if (!RateLimiter.instance) {
      RateLimiter.instance = new RateLimiter();
    }
    return RateLimiter.instance;
  }

  private setupDefaultConfigs(): void {
    this.configs.set('slack_command', {
      windowMs: 60 * 1000, // 1 minute
      maxRequests: 10,
    });

    this.configs.set('ai_embedding', {
      windowMs: 60 * 1000, // 1 minute
      maxRequests: 30,
    });

    this.configs.set('clickup_api', {
      windowMs: 60 * 1000, // 1 minute
      maxRequests: 100,
    });

    this.configs.set('database_search', {
      windowMs: 60 * 1000, // 1 minute
      maxRequests: 50,
    });
  }

  setConfig(key: string, config: RateLimitConfig): void {
    this.configs.set(key, config);
  }

  async checkLimit(key: string, identifier: string): Promise<{
    allowed: boolean;
    remainingRequests: number;
    resetTime: number;
  }> {
    const config = this.configs.get(key);
    if (!config) {
      throw new Error(`Rate limit configuration not found for key: ${key}`);
    }

    const fullKey = `${key}:${identifier}`;
    const now = Date.now();
    const entry = this.limits.get(fullKey);

    if (!entry || now > entry.resetTime) {
      const newEntry: RateLimitEntry = {
        count: 1,
        resetTime: now + config.windowMs,
      };
      this.limits.set(fullKey, newEntry);
      
      return {
        allowed: true,
        remainingRequests: config.maxRequests - 1,
        resetTime: newEntry.resetTime,
      };
    }

    if (entry.count >= config.maxRequests) {
      return {
        allowed: false,
        remainingRequests: 0,
        resetTime: entry.resetTime,
      };
    }

    entry.count++;
    this.limits.set(fullKey, entry);

    return {
      allowed: true,
      remainingRequests: config.maxRequests - entry.count,
      resetTime: entry.resetTime,
    };
  }

  async withRateLimit<T>(
    key: string,
    identifier: string,
    operation: () => Promise<T>
  ): Promise<T> {
    const result = await this.checkLimit(key, identifier);
    
    if (!result.allowed) {
      const resetIn = Math.ceil((result.resetTime - Date.now()) / 1000);
      throw new Error(`Rate limit exceeded. Try again in ${resetIn} seconds.`);
    }

    return await operation();
  }

  private startCleanupTimer(): void {
    setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of this.limits.entries()) {
        if (now > entry.resetTime) {
          this.limits.delete(key);
        }
      }
    }, 5 * 60 * 1000); // Clean up every 5 minutes
  }

  getStats(): { totalEntries: number; activeConfigs: number } {
    return {
      totalEntries: this.limits.size,
      activeConfigs: this.configs.size,
    };
  }

  clearLimits(key?: string): void {
    if (key) {
      const keysToDelete = Array.from(this.limits.keys()).filter(k => k.startsWith(key));
      keysToDelete.forEach(k => this.limits.delete(k));
    } else {
      this.limits.clear();
    }
  }
}

export const rateLimiter = RateLimiter.getInstance();