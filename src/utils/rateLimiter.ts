// rateLimiter.js

import { logger } from './logger.js';

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

export interface RateLimitStatus {
  limited: boolean;
  remaining: number;
  attempts?: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

export async function checkRateLimit(key: string, maxAttempts = 5, windowMs = 60000): Promise<boolean> {
  try {
    const now = Date.now();
    const entry = rateLimitStore.get(key);

    if (!entry || now - entry.windowStart > windowMs) {
      rateLimitStore.set(key, {
        count: 1,
        windowStart: now
      });
      return true;
    }

    if (entry.count < maxAttempts) {
      entry.count++;
      return true;
    }

    logger.debug(`Rate limit exceeded for ${key}`);
    return false;
  } catch (error) {
    logger.error('Error checking rate limit:', error);
    return true; 
  }
}

export function getRateLimitStatus(key: string, windowMs = 60000): RateLimitStatus {
  const entry = rateLimitStore.get(key);
  if (!entry) {
    return { limited: false, remaining: windowMs };
  }

  const elapsed = Date.now() - entry.windowStart;
  const remaining = Math.max(0, windowMs - elapsed);

  return {
    limited: remaining > 0,
    remaining,
    attempts: entry.count
  };
}

export function clearRateLimit(key: string): void {
  rateLimitStore.delete(key);
}

export function clearAllRateLimits(): void {
  rateLimitStore.clear();
  logger.info('All rate limits cleared');
}
