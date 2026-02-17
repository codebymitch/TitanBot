import { logger } from './logger.js';

const rateLimitStore = new Map();

/**
 * Check if action is rate limited
 * @param {string} key - Rate limit key (usually userId + action)
 * @param {number} maxAttempts - Max attempts allowed
 * @param {number} windowMs - Time window in milliseconds
 * @returns {Promise<boolean>} True if allowed, false if rate limited
 */
export async function checkRateLimit(key, maxAttempts = 5, windowMs = 60000) {
  try {
    const now = Date.now();
    const entry = rateLimitStore.get(key);

    // Initialize or reset if window expired
    if (!entry || now - entry.windowStart > windowMs) {
      rateLimitStore.set(key, {
        count: 1,
        windowStart: now
      });
      return true;
    }

    // Check if within attempt limit
    if (entry.count < maxAttempts) {
      entry.count++;
      return true;
    }

    // Rate limited
    logger.debug(`Rate limit exceeded for ${key}`);
    return false;
  } catch (error) {
    logger.error('Error checking rate limit:', error);
    return true; // Allow on error to prevent blocking
  }
}

/**
 * Get current rate limit status
 * @param {string} key - Rate limit key
 * @param {number} windowMs - Time window in milliseconds
 * @returns {Object} Current state and reset time
 */
export function getRateLimitStatus(key, windowMs = 60000) {
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

/**
 * Clear rate limit for a key
 * @param {string} key - Rate limit key
 */
export function clearRateLimit(key) {
  rateLimitStore.delete(key);
}

/**
 * Clear all rate limits (on bot restart)
 */
export function clearAllRateLimits() {
  rateLimitStore.clear();
  logger.info('All rate limits cleared');
}
