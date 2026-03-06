/**
 * Simple in-memory cache with per-key TTL.
 *
 * Used by the market data services to avoid redundant API requests
 * within the same epoch (default TTL = 5 minutes).
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number; // Unix ms
}

export class DataCache {
  private store = new Map<string, CacheEntry<unknown>>();
  private readonly defaultTTL: number;

  /** @param defaultTTLms Default time-to-live in milliseconds (default 5 min). */
  constructor(defaultTTLms = 5 * 60 * 1000) {
    this.defaultTTL = defaultTTLms;
  }

  get<T>(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value as T;
  }

  set<T>(key: string, value: T, ttlMs?: number): void {
    this.store.set(key, {
      value,
      expiresAt: Date.now() + (ttlMs ?? this.defaultTTL),
    });
  }

  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  clear(): void {
    this.store.clear();
  }

  /** Remove all expired entries (optional housekeeping). */
  prune(): void {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (now > entry.expiresAt) this.store.delete(key);
    }
  }
}
