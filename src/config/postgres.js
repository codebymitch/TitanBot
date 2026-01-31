/**
 * PostgreSQL Configuration for Titan Bot
 * Centralizes PostgreSQL connection settings and options
 */

export const pgConfig = {
    // Connection URL - can be overridden by environment variable
    url: process.env.POSTGRES_URL || 'postgresql://localhost:5432/titanbot',
    
    // Connection options
    options: {
        // Host
        host: process.env.POSTGRES_HOST || 'localhost',
        
        // Port
        port: parseInt(process.env.POSTGRES_PORT) || 5432,
        
        // Database name
        database: process.env.POSTGRES_DB || 'titanbot',
        
        // Username
        user: process.env.POSTGRES_USER || 'postgres',
        
        // Password
        password: process.env.POSTGRES_PASSWORD || '',
        
        // SSL configuration
        ssl: process.env.POSTGRES_SSL === 'true' ? {
            rejectUnauthorized: false
        } : false,
        
        // Connection timeout in milliseconds
        connectionTimeoutMillis: 10000,
        
        // Idle timeout in milliseconds
        idleTimeoutMillis: 30000,
        
        // Maximum number of connections in the pool
        max: 20,
        
        // Minimum number of connections in the pool
        min: 2,
        
        // How long a client is allowed to remain idle before being closed
        idleTimeoutMillis: 30000,
        
        // How long to wait when acquiring a client from the pool
        acquireTimeoutMillis: 10000,
        
        // How many times to retry a connection before giving up
        retries: 3,
        
        // Backoff strategy for retries
        backoffBase: 100,
        backoffMultiplier: 2,
    },
    
    // Table names
    tables: {
        guilds: 'guilds',
        users: 'users',
        guild_users: 'guild_users',
        birthdays: 'birthdays',
        giveaways: 'giveaways',
        tickets: 'ticket_data',
        afk_status: 'afk_status',
        welcome_configs: 'welcome_configs',
        leveling_configs: 'leveling_configs',
        user_levels: 'user_levels',
        economy: 'economy',
        invite_tracking: 'invite_tracking',
        application_roles: 'application_roles',
        temp_data: 'temp_data',
        cache_data: 'cache_data',
    },
    
    // Default TTL for different data types (in seconds)
    defaultTTL: {
        // User session data - 24 hours
        userSession: 86400,
        
        // Temporary data - 1 hour
        temp: 3600,
        
        // Cache data - 30 minutes
        cache: 1800,
        
        // Guild config - no expiration (null)
        guildConfig: null,
        
        // Economy data - no expiration (null)
        economy: null,
        
        // Leveling data - no expiration (null)
        leveling: null,
        
        // Giveaway data - expires when giveaway ends
        giveaway: null,
        
        // Ticket data - 7 days
        ticket: 604800,
        
        // AFK status - 24 hours
        afk: 86400,
        
        // Welcome config - no expiration (null)
        welcome: null,
        
        // Birthday data - no expiration (null)
        birthday: null,
    },
    
    // Enable/disable PostgreSQL features
    features: {
        // Enable connection pooling
        pooling: true,
        
        // Enable SSL for connections
        ssl: process.env.POSTGRES_SSL === 'true',
        
        // Enable metrics collection
        metrics: true,
        
        // Enable debug logging
        debug: process.env.NODE_ENV === 'development',
        
        // Enable automatic table creation
        autoCreateTables: true,
        
        // Enable data migration on startup
        autoMigrate: false,
    },
    
    // Health check settings
    healthCheck: {
        // Enable health checks
        enabled: true,
        
        // Health check interval in milliseconds
        interval: 30000,
        
        // Max failed attempts before marking as unhealthy
        maxFailures: 3,
        
        // Query to use for health checks
        query: 'SELECT 1',
    },
    
    // Migration settings
    migration: {
        // Enable automatic migrations
        enabled: false,
        
        // Migration table name
        table: 'migrations',
        
        // Migration files directory
        directory: 'database/migrations',
        
        // Rollback on failure
        rollbackOnFailure: false,
    }
};

// Export default configuration
export default pgConfig;
