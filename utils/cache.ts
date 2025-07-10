interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class Cache<T> {
  private static instances: Map<string, Cache<any>> = new Map();
  private store: Map<string, CacheEntry<T>> = new Map();
  private defaultTTL: number;

  private constructor(defaultTTL: number = 300000) { // 5 minutes default
    this.defaultTTL = defaultTTL;
    this.startCleanupTimer();
  }

  static getInstance<T>(name: string, defaultTTL?: number): Cache<T> {
    if (!Cache.instances.has(name)) {
      Cache.instances.set(name, new Cache<T>(defaultTTL));
    }
    return Cache.instances.get(name)!;
  }

  set(key: string, value: T, ttl?: number): void {
    const expiresAt = Date.now() + (ttl || this.defaultTTL);
    this.store.set(key, { value, expiresAt });
  }

  get(key: string): T | null {
    const entry = this.store.get(key);
    
    if (!entry) {
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }

    return entry.value;
  }

  has(key: string): boolean {
    return this.get(key) !== null;
  }

  delete(key: string): boolean {
    return this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  async getOrSet(
    key: string,
    factory: () => Promise<T>,
    ttl?: number
  ): Promise<T> {
    const cached = this.get(key);
    if (cached !== null) {
      return cached;
    }

    const value = await factory();
    this.set(key, value, ttl);
    return value;
  }

  size(): number {
    return this.store.size;
  }

  keys(): string[] {
    return Array.from(this.store.keys());
  }

  private startCleanupTimer(): void {
    setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of this.store.entries()) {
        if (now > entry.expiresAt) {
          this.store.delete(key);
        }
      }
    }, 60000); // Clean up every minute
  }
}

export const embedCache = Cache.getInstance<number[]>('embeddings', 3600000); // 1 hour
export const searchCache = Cache.getInstance<any>('search', 300000); // 5 minutes
export const playbookCache = Cache.getInstance<any>('playbooks', 600000); // 10 minutes