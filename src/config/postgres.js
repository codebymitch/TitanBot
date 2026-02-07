/**
 * PostgreSQL Configuration for Titan Bot
 * Centralizes PostgreSQL connection settings and options
 */

export const pgConfig = {
    url: process.env.POSTGRES_URL || 'postgresql://localhost:5432/titanbot',
    
    options: {
        host: process.env.POSTGRES_HOST || 'localhost',
        
        port: parseInt(process.env.POSTGRES_PORT) || 5432,
        
        database: process.env.POSTGRES_DB || 'titanbot',
        
        user: process.env.POSTGRES_USER || 'postgres',
        
        password: (process.env.POSTGRES_PASSWORD || '').toString(),
        
        ssl: process.env.POSTGRES_SSL === 'true' ? {
            rejectUnauthorized: false
        } : false,
        
        connectionTimeoutMillis: 10000,
        
        idleTimeoutMillis: 30000,
        
        max: 20,
        
        min: 2,
        
        idleTimeoutMillis: 30000,
        
        acquireTimeoutMillis: 10000,
        
        retries: 3,
        
        backoffBase: 100,
        backoffMultiplier: 2,
    },
    
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
    
    defaultTTL: {
        userSession: 86400,
        
        temp: 3600,
        
        cache: 1800,
        
        guildConfig: null,
        
        economy: null,
        
        leveling: null,
        
        giveaway: null,
        
        ticket: 604800,
        
        afk: 86400,
        
        welcome: null,
        
        birthday: null,
    },
    
    features: {
        pooling: true,
        
        ssl: process.env.POSTGRES_SSL === 'true',
        
        metrics: true,
        
        debug: process.env.NODE_ENV === 'development',
        
        autoCreateTables: true,
        
        autoMigrate: false,
    },
    
    healthCheck: {
        enabled: true,
        
        interval: 30000,
        
        maxFailures: 3,
        
        query: 'SELECT 1',
    },
    
    migration: {
        enabled: false,
        
        table: 'migrations',
        
        directory: 'database/migrations',
        
        rollbackOnFailure: false,
    }
};

export default pgConfig;
