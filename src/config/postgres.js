import { assertAllowlistedIdentifier } from '../utils/sqlIdentifiers.js';
import { EXPECTED_SCHEMA_LABEL, EXPECTED_SCHEMA_VERSION } from './schemaVersion.js';

const configuredTables = {
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
    verification_audit: 'verification_audit',
    temp_data: 'temp_data',
    cache_data: 'cache_data',
};

const allowedTableIdentifiers = new Set([
    'guilds',
    'users',
    'guild_users',
    'birthdays',
    'giveaways',
    'ticket_data',
    'afk_status',
    'welcome_configs',
    'leveling_configs',
    'user_levels',
    'economy',
    'invite_tracking',
    'application_roles',
    'verification_audit',
    'temp_data',
    'cache_data',
]);

const validatedTables = Object.fromEntries(
    Object.entries(configuredTables).map(([key, value]) => [
        key,
        assertAllowlistedIdentifier(value, allowedTableIdentifiers, `PostgreSQL table identifier (${key})`),
    ])
);



export const pgConfig = {
    url: process.env.POSTGRES_URL || 'postgresql://localhost:5432/titanbot',
    
    options: {
        
        host: process.env.POSTGRES_HOST || 'localhost',
        port: parseInt(process.env.POSTGRES_PORT) || 5432,
        database: process.env.POSTGRES_DB || 'titanbot',
        user: process.env.POSTGRES_USER || 'postgres',
        password: (process.env.POSTGRES_PASSWORD || '').toString(),
        ssl: false,
        
        
        max: parseInt(process.env.POSTGRES_MAX_CONNECTIONS) || 20,
        min: parseInt(process.env.POSTGRES_MIN_CONNECTIONS) || 2,
        idleTimeoutMillis: parseInt(process.env.POSTGRES_IDLE_TIMEOUT) || 30000,
        connectionTimeoutMillis: parseInt(process.env.POSTGRES_CONNECTION_TIMEOUT) || 10000,
        
        
        application_name: 'titanbot',
        statement_timeout: process.env.NODE_ENV === 'production' ? 30000 : 0,
        keepalives: 1,
        keepalives_idle: 30,
        
        
        retries: parseInt(process.env.POSTGRES_RETRIES) || 3,
        backoffBase: parseInt(process.env.POSTGRES_BACKOFF_BASE) || 100,
        backoffMultiplier: parseInt(process.env.POSTGRES_BACKOFF_MULTIPLIER) || 2,
    },
    
    tables: validatedTables,
    
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
        ssl: false,
        
        metrics: true,
        
        debug: process.env.NODE_ENV === 'development',
        
        autoCreateTables: true,
        
        autoMigrate: process.env.AUTO_MIGRATE !== 'false',
    },
    
    healthCheck: {
        enabled: true,
        
        interval: 30000,
        
        maxFailures: 3,
        
        query: 'SELECT 1',
    },
    
    migration: {
        enabled: true,
        
        table: 'schema_migrations',
        
        directory: 'database/migrations',
        
        rollbackOnFailure: false,

        expectedVersion: EXPECTED_SCHEMA_VERSION,

        expectedLabel: EXPECTED_SCHEMA_LABEL,
    }
};

export default pgConfig;


