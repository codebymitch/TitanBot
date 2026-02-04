import pg from 'pg';
import { pgConfig } from '../config/postgres.js';
import { logger } from './logger.js';

/**
 * PostgreSQL Database wrapper for Titan Bot
 * Replaces Redis with PostgreSQL for better data persistence and querying
 */
class PostgreSQLDatabase {
    constructor() {
        this.pool = null;
        this.isConnected = false;
        this.connectionPromise = null;
    }

    /**
     * Initialize PostgreSQL connection
     * @returns {Promise<boolean>} Connection status
     */
    async connect() {
        if (this.connectionPromise) {
            return this.connectionPromise;
        }

        this.connectionPromise = this._establishConnection();
        return this.connectionPromise;
    }

    async _establishConnection() {
        try {
            // Ensure environment variables are loaded
            await new Promise(resolve => setTimeout(resolve, 100));

            // Create connection pool
            this.pool = new pg.Pool({
                host: pgConfig.options.host,
                port: pgConfig.options.port,
                database: pgConfig.options.database,
                user: pgConfig.options.user,
                password: pgConfig.options.password,
                ssl: pgConfig.options.ssl,
                max: pgConfig.options.max,
                min: pgConfig.options.min,
                idleTimeoutMillis: pgConfig.options.idleTimeoutMillis,
                connectionTimeoutMillis: pgConfig.options.connectionTimeoutMillis,
            });

            // Test the connection
            const client = await this.pool.connect();
            await client.query('SELECT NOW()');
            client.release();

            this.isConnected = true;
            logger.info('✅ PostgreSQL Database initialized successfully');
            
            // Create tables if auto-create is enabled
            if (pgConfig.features.autoCreateTables) {
                await this.createTables();
            }
            
            return true;
        } catch (error) {
            logger.error('❌ Failed to initialize PostgreSQL Database:', error);
            this.isConnected = false;
            return false;
        }
    }

    /**
     * Check if PostgreSQL is connected
     * @returns {boolean} Connection status
     */
    isAvailable() {
        return this.isConnected && this.pool;
    }

    /**
     * Create database tables
     */
    async createTables() {
        const tables = [
            // Guilds table
            `CREATE TABLE IF NOT EXISTS ${pgConfig.tables.guilds} (
                id VARCHAR(20) PRIMARY KEY,
                config JSONB DEFAULT '{}',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`,
            
            // Users table
            `CREATE TABLE IF NOT EXISTS ${pgConfig.tables.users} (
                id VARCHAR(20) PRIMARY KEY,
                username VARCHAR(100),
                discriminator VARCHAR(10),
                avatar VARCHAR(100),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`,
            
            // Guild users table (for guild-specific user data)
            `CREATE TABLE IF NOT EXISTS ${pgConfig.tables.guild_users} (
                guild_id VARCHAR(20),
                user_id VARCHAR(20),
                joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (guild_id, user_id),
                FOREIGN KEY (guild_id) REFERENCES ${pgConfig.tables.guilds}(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES ${pgConfig.tables.users}(id) ON DELETE CASCADE
            )`,
            
            // Birthdays table
            `CREATE TABLE IF NOT EXISTS ${pgConfig.tables.birthdays} (
                guild_id VARCHAR(20),
                user_id VARCHAR(20),
                month INTEGER NOT NULL,
                day INTEGER NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (guild_id, user_id),
                FOREIGN KEY (guild_id) REFERENCES ${pgConfig.tables.guilds}(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES ${pgConfig.tables.users}(id) ON DELETE CASCADE
            )`,
            
            // Giveaways table
            `CREATE TABLE IF NOT EXISTS ${pgConfig.tables.giveaways} (
                id SERIAL PRIMARY KEY,
                guild_id VARCHAR(20),
                message_id VARCHAR(20) NOT NULL,
                data JSONB NOT NULL,
                ends_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (guild_id) REFERENCES ${pgConfig.tables.guilds}(id) ON DELETE CASCADE,
                UNIQUE(guild_id, message_id)
            )`,
            
            // Tickets table
            `CREATE TABLE IF NOT EXISTS ${pgConfig.tables.tickets} (
                guild_id VARCHAR(20),
                channel_id VARCHAR(20) PRIMARY KEY,
                data JSONB NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                expires_at TIMESTAMP,
                FOREIGN KEY (guild_id) REFERENCES ${pgConfig.tables.guilds}(id) ON DELETE CASCADE
            )`,
            
            // AFK status table
            `CREATE TABLE IF NOT EXISTS ${pgConfig.tables.afk_status} (
                guild_id VARCHAR(20),
                user_id VARCHAR(20),
                reason TEXT,
                status_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                expires_at TIMESTAMP,
                PRIMARY KEY (guild_id, user_id),
                FOREIGN KEY (guild_id) REFERENCES ${pgConfig.tables.guilds}(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES ${pgConfig.tables.users}(id) ON DELETE CASCADE
            )`,
            
            // Welcome configs table
            `CREATE TABLE IF NOT EXISTS ${pgConfig.tables.welcome_configs} (
                guild_id VARCHAR(20) PRIMARY KEY,
                config JSONB NOT NULL DEFAULT '{}',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (guild_id) REFERENCES ${pgConfig.tables.guilds}(id) ON DELETE CASCADE
            )`,
            
            // Leveling configs table
            `CREATE TABLE IF NOT EXISTS ${pgConfig.tables.leveling_configs} (
                guild_id VARCHAR(20) PRIMARY KEY,
                config JSONB NOT NULL DEFAULT '{}',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (guild_id) REFERENCES ${pgConfig.tables.guilds}(id) ON DELETE CASCADE
            )`,
            
            // User levels table
            `CREATE TABLE IF NOT EXISTS ${pgConfig.tables.user_levels} (
                guild_id VARCHAR(20),
                user_id VARCHAR(20),
                xp BIGINT DEFAULT 0,
                level INTEGER DEFAULT 0,
                total_xp BIGINT DEFAULT 0,
                last_message TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                rank INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (guild_id, user_id),
                FOREIGN KEY (guild_id) REFERENCES ${pgConfig.tables.guilds}(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES ${pgConfig.tables.users}(id) ON DELETE CASCADE
            )`,
            
            // Economy table
            `CREATE TABLE IF NOT EXISTS ${pgConfig.tables.economy} (
                guild_id VARCHAR(20),
                user_id VARCHAR(20),
                balance BIGINT DEFAULT 0,
                bank BIGINT DEFAULT 0,
                data JSONB DEFAULT '{}',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (guild_id, user_id),
                FOREIGN KEY (guild_id) REFERENCES ${pgConfig.tables.guilds}(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES ${pgConfig.tables.users}(id) ON DELETE CASCADE
            )`,
            
            // Invite tracking table
            `CREATE TABLE IF NOT EXISTS ${pgConfig.tables.invite_tracking} (
                guild_id VARCHAR(20),
                inviter_id VARCHAR(20),
                invite_code VARCHAR(20),
                uses INTEGER DEFAULT 0,
                data JSONB DEFAULT '{}',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (guild_id, invite_code),
                FOREIGN KEY (guild_id) REFERENCES ${pgConfig.tables.guilds}(id) ON DELETE CASCADE
            )`,
            
            // Application roles table
            `CREATE TABLE IF NOT EXISTS ${pgConfig.tables.application_roles} (
                guild_id VARCHAR(20),
                role_id VARCHAR(20),
                data JSONB DEFAULT '{}',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (guild_id, role_id),
                FOREIGN KEY (guild_id) REFERENCES ${pgConfig.tables.guilds}(id) ON DELETE CASCADE
            )`,
            
            // Temporary data table
            `CREATE TABLE IF NOT EXISTS ${pgConfig.tables.temp_data} (
                key VARCHAR(255) PRIMARY KEY,
                value JSONB NOT NULL,
                expires_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`,
            
            // Cache data table
            `CREATE TABLE IF NOT EXISTS ${pgConfig.tables.cache_data} (
                key VARCHAR(255) PRIMARY KEY,
                value JSONB NOT NULL,
                expires_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`
        ];

        for (const table of tables) {
            try {
                await this.pool.query(table);
            } catch (error) {
                logger.error('Error creating table:', error);
            }
        }
        
        logger.info('✅ Database tables created/verified');
    }

    /**
     * Get a value from PostgreSQL (Redis compatibility layer)
     * @param {string} key - The key to retrieve
     * @param {any} defaultValue - Default value if key doesn't exist
     * @returns {Promise<any>} The value or default
     */
    async get(key, defaultValue = null) {
        try {
            if (!this.isAvailable()) {
                logger.warn('PostgreSQL not available, returning default value');
                return defaultValue;
            }

            // Parse the key to determine table and data
            const parsedKey = this.parseKey(key);
            
            if (parsedKey.type === 'temp') {
                const result = await this.pool.query(
                    `SELECT value FROM ${pgConfig.tables.temp_data} WHERE key = $1 AND (expires_at IS NULL OR expires_at > NOW())`,
                    [parsedKey.fullKey]
                );
                return result.rows.length > 0 ? result.rows[0].value : defaultValue;
            }
            
            if (parsedKey.type === 'cache') {
                const result = await this.pool.query(
                    `SELECT value FROM ${pgConfig.tables.cache_data} WHERE key = $1 AND (expires_at IS NULL OR expires_at > NOW())`,
                    [parsedKey.fullKey]
                );
                return result.rows.length > 0 ? result.rows[0].value : defaultValue;
            }

            // Handle structured keys
            return await this.getStructuredData(parsedKey, defaultValue);
        } catch (error) {
            logger.error(`Error getting value for key ${key}:`, error);
            return defaultValue;
        }
    }

    /**
     * Set a value in PostgreSQL (Redis compatibility layer)
     * @param {string} key - The key to set
     * @param {any} value - The value to store
     * @param {number} ttl - Optional TTL in seconds
     * @returns {Promise<boolean>} Success status
     */
    async set(key, value, ttl = null) {
        try {
            if (!this.isAvailable()) {
                logger.warn('PostgreSQL not available, cannot set value');
                return false;
            }

            // Parse the key to determine table and data
            const parsedKey = this.parseKey(key);
            const expiresAt = ttl ? new Date(Date.now() + ttl * 1000) : null;
            
            if (parsedKey.type === 'temp') {
                await this.pool.query(
                    `INSERT INTO ${pgConfig.tables.temp_data} (key, value, expires_at) 
                     VALUES ($1, $2, $3) 
                     ON CONFLICT (key) DO UPDATE SET value = $2, expires_at = $3`,
                    [parsedKey.fullKey, value, expiresAt]
                );
                return true;
            }
            
            if (parsedKey.type === 'cache') {
                await this.pool.query(
                    `INSERT INTO ${pgConfig.tables.cache_data} (key, value, expires_at) 
                     VALUES ($1, $2, $3) 
                     ON CONFLICT (key) DO UPDATE SET value = $2, expires_at = $3`,
                    [parsedKey.fullKey, value, expiresAt]
                );
                return true;
            }

            // Handle structured keys
            return await this.setStructuredData(parsedKey, value, ttl);
        } catch (error) {
            logger.error(`Error setting value for key ${key}:`, error);
            return false;
        }
    }

    /**
     * Delete a key from PostgreSQL
     * @param {string} key - The key to delete
     * @returns {Promise<boolean>} Success status
     */
    async delete(key) {
        try {
            if (!this.isAvailable()) {
                logger.warn('PostgreSQL not available, cannot delete key');
                return false;
            }

            const parsedKey = this.parseKey(key);
            
            if (parsedKey.type === 'temp') {
                await this.pool.query(`DELETE FROM ${pgConfig.tables.temp_data} WHERE key = $1`, [parsedKey.fullKey]);
                return true;
            }
            
            if (parsedKey.type === 'cache') {
                await this.pool.query(`DELETE FROM ${pgConfig.tables.cache_data} WHERE key = $1`, [parsedKey.fullKey]);
                return true;
            }

            // Handle structured keys
            return await this.deleteStructuredData(parsedKey);
        } catch (error) {
            logger.error(`Error deleting key ${key}:`, error);
            return false;
        }
    }

    /**
     * List all keys with a given prefix
     * @param {string} prefix - The prefix to search for
     * @returns {Promise<Array>} Array of matching keys
     */
    async list(prefix) {
        try {
            if (!this.isAvailable()) {
                logger.warn('PostgreSQL not available, returning empty list');
                return [];
            }

            const keys = [];
            
            // Search in temp_data
            const tempResult = await this.pool.query(
                `SELECT key FROM ${pgConfig.tables.temp_data} WHERE key LIKE $1 AND (expires_at IS NULL OR expires_at > NOW())`,
                [`${prefix}%`]
            );
            keys.push(...tempResult.rows.map(row => row.key));
            
            // Search in cache_data
            const cacheResult = await this.pool.query(
                `SELECT key FROM ${pgConfig.tables.cache_data} WHERE key LIKE $1 AND (expires_at IS NULL OR expires_at > NOW())`,
                [`${prefix}%`]
            );
            keys.push(...cacheResult.rows.map(row => row.key));

            return keys;
        } catch (error) {
            logger.error(`Error listing keys with prefix ${prefix}:`, error);
            return [];
        }
    }

    /**
     * Check if a key exists
     * @param {string} key - The key to check
     * @returns {Promise<boolean>} Whether the key exists
     */
    async exists(key) {
        try {
            if (!this.isAvailable()) {
                return false;
            }

            const value = await this.get(key);
            return value !== null;
        } catch (error) {
            logger.error(`Error checking if key exists ${key}:`, error);
            return false;
        }
    }

    /**
     * Increment a numeric value
     * @param {string} key - The key to increment
     * @param {number} amount - Amount to increment by (default: 1)
     * @returns {Promise<number>} New value
     */
    async increment(key, amount = 1) {
        try {
            if (!this.isAvailable()) {
                return amount;
            }

            const currentValue = await this.get(key, 0);
            const newValue = (typeof currentValue === 'number' ? currentValue : 0) + amount;
            await this.set(key, newValue);
            return newValue;
        } catch (error) {
            logger.error(`Error incrementing key ${key}:`, error);
            return amount;
        }
    }

    /**
     * Decrement a numeric value
     * @param {string} key - The key to decrement
     * @param {number} amount - Amount to decrement by (default: 1)
     * @returns {Promise<number>} New value
     */
    async decrement(key, amount = 1) {
        try {
            if (!this.isAvailable()) {
                return -amount;
            }

            const currentValue = await this.get(key, 0);
            const newValue = (typeof currentValue === 'number' ? currentValue : 0) - amount;
            await this.set(key, newValue);
            return newValue;
        } catch (error) {
            logger.error(`Error decrementing key ${key}:`, error);
            return -amount;
        }
    }

    /**
     * Parse a Redis-style key to determine type and components
     * @param {string} key - The key to parse
     * @returns {Object} Parsed key information
     */
    parseKey(key) {
        // Handle temp and cache keys
        if (key.startsWith('temp:')) {
            return { type: 'temp', fullKey: key };
        }
        if (key.startsWith('cache:')) {
            return { type: 'cache', fullKey: key };
        }

        // Parse structured keys like "guild:12345:config"
        const parts = key.split(':');
        
        if (parts[0] === 'guild') {
            if (parts[2] === 'config') {
                return { type: 'guild_config', guildId: parts[1], fullKey: key };
            }
            if (parts[2] === 'birthdays') {
                return { type: 'guild_birthdays', guildId: parts[1], fullKey: key };
            }
            if (parts[2] === 'giveaways') {
                return { type: 'guild_giveaways', guildId: parts[1], fullKey: key };
            }
            if (parts[2] === 'welcome') {
                return { type: 'welcome_config', guildId: parts[1], fullKey: key };
            }
            if (parts[2] === 'leveling') {
                if (parts[3] === 'config') {
                    return { type: 'leveling_config', guildId: parts[1], fullKey: key };
                }
                if (parts[3] === 'users') {
                    return { type: 'user_level', guildId: parts[1], userId: parts[4], fullKey: key };
                }
                return { type: 'leveling_data', guildId: parts[1], fullKey: key };
            }
            if (parts[2] === 'economy' && parts[3]) {
                return { type: 'economy', guildId: parts[1], userId: parts[3], fullKey: key };
            }
            if (parts[2] === 'afk' && parts[3]) {
                return { type: 'afk_status', guildId: parts[1], userId: parts[3], fullKey: key };
            }
            if (parts[2] === 'ticket' && parts[3]) {
                return { type: 'ticket', guildId: parts[1], channelId: parts[3], fullKey: key };
            }
        }

        // Default to temp data for unknown keys
        return { type: 'temp', fullKey: key };
    }

    /**
     * Get structured data from appropriate table
     * @param {Object} parsedKey - Parsed key information
     * @param {any} defaultValue - Default value
     * @returns {Promise<any>} The data
     */
    async getStructuredData(parsedKey, defaultValue) {
        try {
            switch (parsedKey.type) {
                case 'guild_config':
                    const guildResult = await this.pool.query(
                        `SELECT config FROM ${pgConfig.tables.guilds} WHERE id = $1`,
                        [parsedKey.guildId]
                    );
                    return guildResult.rows.length > 0 ? guildResult.rows[0].config : defaultValue;
                
                case 'guild_birthdays':
                    const birthdayResult = await this.pool.query(
                        `SELECT user_id, month, day FROM ${pgConfig.tables.birthdays} WHERE guild_id = $1`,
                        [parsedKey.guildId]
                    );
                    const birthdays = {};
                    birthdayResult.rows.forEach(row => {
                        birthdays[row.user_id] = { month: row.month, day: row.day };
                    });
                    return birthdays;
                
                case 'guild_giveaways':
                    const giveawayResult = await this.pool.query(
                        `SELECT data FROM ${pgConfig.tables.giveaways} WHERE guild_id = $1`,
                        [parsedKey.guildId]
                    );
                    return giveawayResult.rows.map(row => row.data);
                
                case 'welcome_config':
                    const welcomeResult = await this.pool.query(
                        `SELECT config FROM ${pgConfig.tables.welcome_configs} WHERE guild_id = $1`,
                        [parsedKey.guildId]
                    );
                    return welcomeResult.rows.length > 0 ? welcomeResult.rows[0].config : defaultValue;
                
                case 'leveling_config':
                    const levelingConfigResult = await this.pool.query(
                        `SELECT config FROM ${pgConfig.tables.leveling_configs} WHERE guild_id = $1`,
                        [parsedKey.guildId]
                    );
                    return levelingConfigResult.rows.length > 0 ? levelingConfigResult.rows[0].config : defaultValue;
                
                case 'user_level':
                    const userLevelResult = await this.pool.query(
                        `SELECT xp, level, total_xp, last_message, rank FROM ${pgConfig.tables.user_levels} WHERE guild_id = $1 AND user_id = $2`,
                        [parsedKey.guildId, parsedKey.userId]
                    );
                    return userLevelResult.rows.length > 0 ? userLevelResult.rows[0] : defaultValue;
                
                case 'economy':
                    const economyResult = await this.pool.query(
                        `SELECT balance, bank, data FROM ${pgConfig.tables.economy} WHERE guild_id = $1 AND user_id = $2`,
                        [parsedKey.guildId, parsedKey.userId]
                    );
                    return economyResult.rows.length > 0 ? economyResult.rows[0] : defaultValue;
                
                case 'afk_status':
                    const afkResult = await this.pool.query(
                        `SELECT reason, status_at, expires_at FROM ${pgConfig.tables.afk_status} WHERE guild_id = $1 AND user_id = $2`,
                        [parsedKey.guildId, parsedKey.userId]
                    );
                    return afkResult.rows.length > 0 ? afkResult.rows[0] : defaultValue;
                
                case 'ticket':
                    const ticketResult = await this.pool.query(
                        `SELECT data FROM ${pgConfig.tables.tickets} WHERE guild_id = $1 AND channel_id = $2`,
                        [parsedKey.guildId, parsedKey.channelId]
                    );
                    return ticketResult.rows.length > 0 ? ticketResult.rows[0].data : defaultValue;
                
                default:
                    return defaultValue;
            }
        } catch (error) {
            logger.error(`Error getting structured data for ${parsedKey.fullKey}:`, error);
            return defaultValue;
        }
    }

    /**
     * Set structured data to appropriate table
     * @param {Object} parsedKey - Parsed key information
     * @param {any} value - Value to set
     * @param {number} ttl - Optional TTL
     * @returns {Promise<boolean>} Success status
     */
    async setStructuredData(parsedKey, value, ttl) {
        try {
            switch (parsedKey.type) {
                case 'guild_config':
                    await this.pool.query(
                        `INSERT INTO ${pgConfig.tables.guilds} (id, config, updated_at) 
                         VALUES ($1, $2, CURRENT_TIMESTAMP) 
                         ON CONFLICT (id) DO UPDATE SET config = $2, updated_at = CURRENT_TIMESTAMP`,
                        [parsedKey.guildId, value]
                    );
                    return true;
                
                case 'guild_birthdays':
                    // Ensure guild exists before inserting birthday data
                    await this.pool.query(
                        `INSERT INTO ${pgConfig.tables.guilds} (id, created_at) 
                         VALUES ($1, CURRENT_TIMESTAMP) 
                         ON CONFLICT (id) DO NOTHING`,
                        [parsedKey.guildId]
                    );
                    
                    // Clear existing birthdays for this guild
                    await this.pool.query(`DELETE FROM ${pgConfig.tables.birthdays} WHERE guild_id = $1`, [parsedKey.guildId]);
                    
                    // Insert new birthdays with user existence checks
                    for (const [userId, birthday] of Object.entries(value)) {
                        // Ensure user exists before inserting birthday data
                        await this.pool.query(
                            `INSERT INTO ${pgConfig.tables.users} (id, created_at) 
                             VALUES ($1, CURRENT_TIMESTAMP) 
                             ON CONFLICT (id) DO NOTHING`,
                            [userId]
                        );
                        
                        await this.pool.query(
                            `INSERT INTO ${pgConfig.tables.birthdays} (guild_id, user_id, month, day) 
                             VALUES ($1, $2, $3, $4)`,
                            [parsedKey.guildId, userId, birthday.month, birthday.day]
                        );
                    }
                    return true;
                
                case 'guild_giveaways':
                    // Ensure guild exists before inserting giveaway data
                    await this.pool.query(
                        `INSERT INTO ${pgConfig.tables.guilds} (id, created_at) 
                         VALUES ($1, CURRENT_TIMESTAMP) 
                         ON CONFLICT (id) DO NOTHING`,
                        [parsedKey.guildId]
                    );
                    
                    // Clear existing giveaways for this guild
                    await this.pool.query(`DELETE FROM ${pgConfig.tables.giveaways} WHERE guild_id = $1`, [parsedKey.guildId]);
                    
                    // Insert new giveaways
                    for (const giveaway of value) {
                        await this.pool.query(
                            `INSERT INTO ${pgConfig.tables.giveaways} (guild_id, message_id, data, ends_at) 
                             VALUES ($1, $2, $3, $4)`,
                            [parsedKey.guildId, giveaway.messageId, giveaway, giveaway.endsAt ? new Date(giveaway.endsAt) : null]
                        );
                    }
                    return true;
                
                case 'welcome_config':
                    // Ensure guild exists before inserting welcome config
                    await this.pool.query(
                        `INSERT INTO ${pgConfig.tables.guilds} (id, created_at) 
                         VALUES ($1, CURRENT_TIMESTAMP) 
                         ON CONFLICT (id) DO NOTHING`,
                        [parsedKey.guildId]
                    );
                    
                    await this.pool.query(
                        `INSERT INTO ${pgConfig.tables.welcome_configs} (guild_id, config, updated_at) 
                         VALUES ($1, $2, CURRENT_TIMESTAMP) 
                         ON CONFLICT (guild_id) DO UPDATE SET config = $2, updated_at = CURRENT_TIMESTAMP`,
                        [parsedKey.guildId, value]
                    );
                    return true;
                
                case 'leveling_config':
                    // Ensure guild exists before inserting leveling config
                    await this.pool.query(
                        `INSERT INTO ${pgConfig.tables.guilds} (id, created_at) 
                         VALUES ($1, CURRENT_TIMESTAMP) 
                         ON CONFLICT (id) DO NOTHING`,
                        [parsedKey.guildId]
                    );
                    
                    await this.pool.query(
                        `INSERT INTO ${pgConfig.tables.leveling_configs} (guild_id, config, updated_at) 
                         VALUES ($1, $2, CURRENT_TIMESTAMP) 
                         ON CONFLICT (guild_id) DO UPDATE SET config = $2, updated_at = CURRENT_TIMESTAMP`,
                        [parsedKey.guildId, value]
                    );
                    return true;
                
                case 'user_level':
                    // Ensure guild exists before inserting user level data
                    await this.pool.query(
                        `INSERT INTO ${pgConfig.tables.guilds} (id, created_at) 
                         VALUES ($1, CURRENT_TIMESTAMP) 
                         ON CONFLICT (id) DO NOTHING`,
                        [parsedKey.guildId]
                    );
                    
                    // Ensure user exists before inserting user level data
                    await this.pool.query(
                        `INSERT INTO ${pgConfig.tables.users} (id, created_at) 
                         VALUES ($1, CURRENT_TIMESTAMP) 
                         ON CONFLICT (id) DO NOTHING`,
                        [parsedKey.userId]
                    );
                    
                    await this.pool.query(
                        `INSERT INTO ${pgConfig.tables.user_levels} (guild_id, user_id, xp, level, total_xp, last_message, rank, updated_at) 
                         VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP) 
                         ON CONFLICT (guild_id, user_id) DO UPDATE SET 
                         xp = $3, level = $4, total_xp = $5, last_message = $6, rank = $7, updated_at = CURRENT_TIMESTAMP`,
                        [parsedKey.guildId, parsedKey.userId, value.xp || 0, value.level || 0, value.totalXp || 0, value.lastMessage || new Date(), value.rank || 0]
                    );
                    return true;
                
                case 'economy':
                    // Ensure guild exists before inserting economy data to satisfy foreign key constraint
                    await this.pool.query(
                        `INSERT INTO ${pgConfig.tables.guilds} (id, created_at) 
                         VALUES ($1, CURRENT_TIMESTAMP) 
                         ON CONFLICT (id) DO NOTHING`,
                        [parsedKey.guildId]
                    );
                    
                    // Ensure user exists before inserting economy data to satisfy foreign key constraint
                    await this.pool.query(
                        `INSERT INTO ${pgConfig.tables.users} (id, created_at) 
                         VALUES ($1, CURRENT_TIMESTAMP) 
                         ON CONFLICT (id) DO NOTHING`,
                        [parsedKey.userId]
                    );
                    
                    await this.pool.query(
                        `INSERT INTO ${pgConfig.tables.economy} (guild_id, user_id, balance, bank, data, updated_at) 
                         VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP) 
                         ON CONFLICT (guild_id, user_id) DO UPDATE SET 
                         balance = $3, bank = $4, data = $5, updated_at = CURRENT_TIMESTAMP`,
                        [parsedKey.guildId, parsedKey.userId, value.balance || 0, value.bank || 0, value.data || {}]
                    );
                    return true;
                
                case 'afk_status':
                    // Ensure guild exists before inserting AFK status
                    await this.pool.query(
                        `INSERT INTO ${pgConfig.tables.guilds} (id, created_at) 
                         VALUES ($1, CURRENT_TIMESTAMP) 
                         ON CONFLICT (id) DO NOTHING`,
                        [parsedKey.guildId]
                    );
                    
                    // Ensure user exists before inserting AFK status
                    await this.pool.query(
                        `INSERT INTO ${pgConfig.tables.users} (id, created_at) 
                         VALUES ($1, CURRENT_TIMESTAMP) 
                         ON CONFLICT (id) DO NOTHING`,
                        [parsedKey.userId]
                    );
                    
                    await this.pool.query(
                        `INSERT INTO ${pgConfig.tables.afk_status} (guild_id, user_id, reason, expires_at) 
                         VALUES ($1, $2, $3, $4) 
                         ON CONFLICT (guild_id, user_id) DO UPDATE SET 
                         reason = $3, expires_at = $4, status_at = CURRENT_TIMESTAMP`,
                        [parsedKey.guildId, parsedKey.userId, value.reason, value.expiresAt ? new Date(value.expiresAt) : null]
                    );
                    return true;
                
                case 'ticket':
                    // Ensure guild exists before inserting ticket data
                    await this.pool.query(
                        `INSERT INTO ${pgConfig.tables.guilds} (id, created_at) 
                         VALUES ($1, CURRENT_TIMESTAMP) 
                         ON CONFLICT (id) DO NOTHING`,
                        [parsedKey.guildId]
                    );
                    
                    await this.pool.query(
                        `INSERT INTO ${pgConfig.tables.tickets} (guild_id, channel_id, data, expires_at) 
                         VALUES ($1, $2, $3, $4) 
                         ON CONFLICT (channel_id) DO UPDATE SET 
                         data = $3, expires_at = $4, updated_at = CURRENT_TIMESTAMP`,
                        [parsedKey.guildId, parsedKey.channelId, value, ttl ? new Date(Date.now() + ttl * 1000) : null]
                    );
                    return true;
                
                default:
                    return false;
            }
        } catch (error) {
            logger.error(`Error setting structured data for ${parsedKey.fullKey}:`, error);
            return false;
        }
    }

    /**
     * Delete structured data from appropriate table
     * @param {Object} parsedKey - Parsed key information
     * @returns {Promise<boolean>} Success status
     */
    async deleteStructuredData(parsedKey) {
        try {
            switch (parsedKey.type) {
                case 'guild_config':
                    await this.pool.query(`DELETE FROM ${pgConfig.tables.guilds} WHERE id = $1`, [parsedKey.guildId]);
                    return true;
                
                case 'guild_birthdays':
                    await this.pool.query(`DELETE FROM ${pgConfig.tables.birthdays} WHERE guild_id = $1`, [parsedKey.guildId]);
                    return true;
                
                case 'guild_giveaways':
                    await this.pool.query(`DELETE FROM ${pgConfig.tables.giveaways} WHERE guild_id = $1`, [parsedKey.guildId]);
                    return true;
                
                case 'welcome_config':
                    await this.pool.query(`DELETE FROM ${pgConfig.tables.welcome_configs} WHERE guild_id = $1`, [parsedKey.guildId]);
                    return true;
                
                case 'leveling_config':
                    await this.pool.query(`DELETE FROM ${pgConfig.tables.leveling_configs} WHERE guild_id = $1`, [parsedKey.guildId]);
                    return true;
                
                case 'user_level':
                    await this.pool.query(`DELETE FROM ${pgConfig.tables.user_levels} WHERE guild_id = $1 AND user_id = $2`, [parsedKey.guildId, parsedKey.userId]);
                    return true;
                
                case 'economy':
                    await this.pool.query(`DELETE FROM ${pgConfig.tables.economy} WHERE guild_id = $1 AND user_id = $2`, [parsedKey.guildId, parsedKey.userId]);
                    return true;
                
                case 'afk_status':
                    await this.pool.query(`DELETE FROM ${pgConfig.tables.afk_status} WHERE guild_id = $1 AND user_id = $2`, [parsedKey.guildId, parsedKey.userId]);
                    return true;
                
                case 'ticket':
                    await this.pool.query(`DELETE FROM ${pgConfig.tables.tickets} WHERE guild_id = $1 AND channel_id = $2`, [parsedKey.guildId, parsedKey.channelId]);
                    return true;
                
                default:
                    return false;
            }
        } catch (error) {
            logger.error(`Error deleting structured data for ${parsedKey.fullKey}:`, error);
            return false;
        }
    }

    /**
     * Close PostgreSQL connection
     */
    async disconnect() {
        try {
            if (this.pool) {
                await this.pool.end();
                logger.info('PostgreSQL connection closed');
            }
        } catch (error) {
            logger.error('Error closing PostgreSQL connection:', error);
        }
    }

    /**
     * Get PostgreSQL info for debugging
     * @returns {Promise<Object>} PostgreSQL server info
     */
    async getInfo() {
        try {
            if (!this.isAvailable()) {
                return null;
            }

            const result = await this.pool.query('SELECT version()');
            return {
                version: result.rows[0].version,
                connected: this.isConnected,
                poolSize: this.pool.totalCount,
                idleCount: this.pool.idleCount,
                waitingCount: this.pool.waitingCount
            };
        } catch (error) {
            logger.error('Error getting PostgreSQL info:', error);
            return null;
        }
    }
}

// Create singleton instance
const pgDb = new PostgreSQLDatabase();

export { PostgreSQLDatabase, pgDb };
