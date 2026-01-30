/**
 * Redis Configuration for Titan Bot
 * Centralizes Redis connection settings and options
 */

export const redisConfig = {
    // Connection URL - can be overridden by environment variable
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    
    // Connection options
    options: {
        // Retry strategy for reconnections
        reconnectStrategy: (retries) => {
            if (retries > 10) {
                logger.error('Redis reconnection failed after 10 attempts');
                return new Error('Redis reconnection failed');
            }
            return Math.min(retries * 50, 500);
        },
        
        // Connection timeout
        connectTimeout: 10000,
        
        // Command timeout
        commandTimeout: 5000,
        
        // Lazy connect
        lazyConnect: true,
        
        // Keep alive
        keepAlive: 30000,
        
        // Family (4 for IPv4, 6 for IPv6, 0 for both)
        family: 4,
        
        // Database number (0-15)
        database: process.env.REDIS_DB || 0,
    },
    
    // Default TTL for keys (in seconds)
    defaultTTL: {
        // User session data - 24 hours
        userSession: 86400,
        
        // Temporary data - 1 hour
        temp: 3600,
        
        // Cache data - 30 minutes
        cache: 1800,
        
        // Guild config - no expiration (0)
        guildConfig: 0,
        
        // Economy data - no expiration (0)
        economy: 0,
        
        // Leveling data - no expiration (0)
        leveling: 0,
        
        // Giveaway data - expires when giveaway ends
        giveaway: 0,
        
        // Ticket data - 7 days
        ticket: 604800,
        
        // AFK status - 24 hours
        afk: 86400,
        
        // Welcome config - no expiration (0)
        welcome: 0,
        
        // Birthday data - no expiration (0)
        birthday: 0,
    },
    
    // Key prefixes for different data types
    prefixes: {
        guild: 'guild',
        user: 'user',
        economy: 'economy',
        leveling: 'leveling',
        giveaway: 'giveaway',
        ticket: 'ticket',
        afk: 'afk',
        welcome: 'welcome',
        birthday: 'birthday',
        config: 'config',
        cache: 'cache',
        temp: 'temp',
    },
    
    // Enable/disable Redis features
    features: {
        // Enable compression for large values
        compression: false,
        
        // Enable encryption for sensitive data
        encryption: false,
        
        // Enable metrics collection
        metrics: true,
        
        // Enable debug logging
        debug: process.env.NODE_ENV === 'development',
    },
    
    // Health check settings
    healthCheck: {
        // Enable health checks
        enabled: true,
        
        // Health check interval in milliseconds
        interval: 30000,
        
        // Max failed attempts before marking as unhealthy
        maxFailures: 3,
    },
    
    // Pool settings (if using Redis cluster)
    pool: {
        // Max connections
        maxConnections: 10,
        
        // Min connections
        minConnections: 2,
        
        // Connection timeout
        acquireTimeoutMillis: 10000,
        
        // Idle timeout
        idleTimeoutMillis: 30000,
    }
};

// Export default configuration
export default redisConfig;
