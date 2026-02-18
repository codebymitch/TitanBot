import { logger } from './logger.js';

const rateLimitStore = new Map();








export async function checkRateLimit(key, maxAttempts = 5, windowMs = 60000) {
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





export function clearRateLimit(key) {
  rateLimitStore.delete(key);
}




export function clearAllRateLimits() {
  rateLimitStore.clear();
  logger.info('All rate limits cleared');
}
