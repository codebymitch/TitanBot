// postgresDatabase.js

import pg from 'pg';
import { pgConfig, resolvePostgresPoolConfig } from '../config/database/postgres.js';
import { logger } from './logger.js';
import { assertAllowlistedIdentifier, quoteIdentifier } from './sqlIdentifiers.js';
import { parseKey } from './database/keyParser.js';
import {
    tableStatements,
    indexStatements,
    UPDATE_TIMESTAMP_FUNCTION,
    triggerDefinitions,
} from './database/schema.js';

class PostgreSQLDatabase {
    constructor() {
        this.pool = null;
        this.isConnected = false;
        this.connectionPromise = null;
        this.allowedTableIdentifiers = new Set(Object.values(pgConfig.tables));
        this.allowedMigrationIdentifiers = new Set([pgConfig.migration.table]);
        this.lastFailureReason = null;
        this.lastFailureMessage = null;
    }

    async connect() {
        if (this.connectionPromise) {
            return this.connectionPromise;
        }

        this.connectionPromise = this._establishConnection();
        return this.connectionPromise;
    }

    async _establishConnection() {
        const retries = Number.isFinite(pgConfig.options.retries) ? pgConfig.options.retries : 0;
        const baseDelay = Number.isFinite(pgConfig.options.backoffBase) ? pgConfig.options.backoffBase : 100;
        const multiplier = Number.isFinite(pgConfig.options.backoffMultiplier) ? pgConfig.options.backoffMultiplier : 2;
        const attempts = Math.max(1, retries + 1);

        for (let attempt = 1; attempt <= attempts; attempt += 1) {
            try {
                await new Promise(resolve => setTimeout(resolve, 100));

                this.pool = new pg.Pool(resolvePostgresPoolConfig());

                this.pool.on('error', (error, client) => {
                    logger.error('PostgreSQL pool error:', error);
                });

                const client = await this.pool.connect();
                await client.query('SELECT NOW()');
                client.release();

                this.lastFailureReason = null;
                this.lastFailureMessage = null;

                this.isConnected = true;
                logger.info('PostgreSQL Database initialized successfully');

                if (pgConfig.features.autoCreateTables) {
                    await this.createTables();
                }

                if (pgConfig.migration.enabled) {
                    const migrationCheck = await this.verifySchemaVersion();
                    if (!migrationCheck.ok) {
                        const shouldBootstrapSchema =
                            migrationCheck.reason === 'MISSING_MIGRATION_VERSION'
                            && pgConfig.features.autoMigrate;

                        if (shouldBootstrapSchema) {
                            await this.setSchemaVersion(
                                pgConfig.migration.expectedVersion,
                                pgConfig.migration.expectedLabel
                            );
                            logger.warn(
                                `No schema version found. Bootstrapped schema ledger to version ${pgConfig.migration.expectedVersion} (${pgConfig.migration.expectedLabel}).`
                            );
                            return true;
                        }

                        const error = new Error(
                            `Schema version check failed: expected ${migrationCheck.expectedVersion} but found ${migrationCheck.currentVersion === null ? 'none' : migrationCheck.currentVersion}`
                        );
                        error.code = 'SCHEMA_VERSION_MISMATCH';
                        throw error;
                    }
                }

                return true;
            } catch (error) {
                this.lastFailureReason = error.code || 'POSTGRES_CONNECTION_FAILED';
                this.lastFailureMessage = error.message || 'Unknown PostgreSQL error';

                if (this.pool) {
                    try {
                        await this.pool.end();
                    } catch (closeError) {
                        logger.warn('Failed to close PostgreSQL pool after error:', closeError.message);
                    }
                    this.pool = null;
                }

                const isLastAttempt = attempt >= attempts;
                const isSchemaMismatch = error.code === 'SCHEMA_VERSION_MISMATCH';
                if (isLastAttempt) {
                    logger.error('Failed to initialize PostgreSQL Database:', error);
                    this.isConnected = false;
                    return false;
                }

                if (isSchemaMismatch) {
                    logger.error('Failed to initialize PostgreSQL Database:', error);
                    this.isConnected = false;
                    return false;
                }

                logger.warn(`PostgreSQL connection attempt ${attempt} failed: ${error.message}`);
                const backoff = Math.round(baseDelay * Math.pow(multiplier, attempt - 1));
                await new Promise(resolve => setTimeout(resolve, backoff));
            }
        }

        this.isConnected = false;
        return false;
    }

    isAvailable() {
        return this.isConnected && this.pool;
    }

    getLastFailure() {
        return {
            reason: this.lastFailureReason,
            message: this.lastFailureMessage
        };
    }

    async ensureMigrationLedger() {
        const migrationTable = assertAllowlistedIdentifier(
            pgConfig.migration.table,
            this.allowedMigrationIdentifiers,
            'PostgreSQL migration table identifier'
        );
        const safeMigrationTable = quoteIdentifier(migrationTable);

        await this.pool.query(`
            CREATE TABLE IF NOT EXISTS ${safeMigrationTable} (
                version INTEGER PRIMARY KEY,
                label VARCHAR(255) NOT NULL,
                applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        return safeMigrationTable;
    }

    async getLatestSchemaVersion() {
        const safeMigrationTable = await this.ensureMigrationLedger();
        const result = await this.pool.query(
            `SELECT version, label, applied_at FROM ${safeMigrationTable} ORDER BY version DESC LIMIT 1`
        );

        if (result.rows.length === 0) {
            return null;
        }

        return result.rows[0];
    }

    async setSchemaVersion(version, label) {
        const safeMigrationTable = await this.ensureMigrationLedger();
        await this.pool.query(
            `INSERT INTO ${safeMigrationTable} (version, label)
             VALUES ($1, $2)
             ON CONFLICT (version)
             DO UPDATE SET label = EXCLUDED.label, applied_at = CURRENT_TIMESTAMP`,
            [version, label]
        );
    }

    async verifySchemaVersion() {
        const latest = await this.getLatestSchemaVersion();
        const expectedVersion = Number(pgConfig.migration.expectedVersion);

        if (!latest) {
            return {
                ok: false,
                expectedVersion,
                currentVersion: null,
                reason: 'MISSING_MIGRATION_VERSION'
            };
        }

        const currentVersion = Number(latest.version);
        const isValid = currentVersion === expectedVersion;

        return {
            ok: isValid,
            expectedVersion,
            currentVersion,
            label: latest.label,
            appliedAt: latest.applied_at,
            reason: isValid ? 'OK' : 'SCHEMA_VERSION_MISMATCH'
        };
    }

    async createTables() {
        for (const table of tableStatements) {
            try {
                await this.pool.query(table);
            } catch (error) {
                logger.error('Error creating table:', error);
            }
        }
        
        logger.info('Database tables created/verified');
        
        await this.createIndexes();
        await this.createAuditTriggers();
    }

    async createIndexes() {
        for (const index of indexStatements) {
            try {
                await this.pool.query(index);
            } catch (error) {
                logger.warn('Error creating index:', error.message);
            }
        }
        
        logger.info('Performance indexes created/verified');
    }

    async createAuditTriggers() {
        try {
            await this.pool.query(UPDATE_TIMESTAMP_FUNCTION);

            const triggers = triggerDefinitions;

            const allowedTriggerIdentifiers = new Set(triggers.map(trigger => trigger.name));

            for (const trigger of triggers) {
                try {
                    const safeTriggerIdentifier = assertAllowlistedIdentifier(
                        trigger.name,
                        allowedTriggerIdentifiers,
                        'Trigger identifier'
                    );
                    const safeTableIdentifier = assertAllowlistedIdentifier(
                        trigger.table,
                        this.allowedTableIdentifiers,
                        'Trigger table identifier'
                    );

                    await this.pool.query(
                        `DROP TRIGGER IF EXISTS ${quoteIdentifier(safeTriggerIdentifier)} ON ${quoteIdentifier(safeTableIdentifier)};`
                    );
                    await this.pool.query(
                        `CREATE TRIGGER ${quoteIdentifier(safeTriggerIdentifier)}
                         BEFORE UPDATE ON ${quoteIdentifier(safeTableIdentifier)}
                         FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();`
                    );
                } catch (error) {
                    logger.warn(`Error creating trigger ${trigger.name} on ${trigger.table}: ${error.message}`);
                }
            }
            
            logger.info('Audit triggers created/verified');
        } catch (error) {
            logger.warn('Error creating audit triggers:', error.message);
        }
    }

    async _getTempValue(key, defaultValue = null) {
        const result = await this.pool.query(
            `SELECT value FROM ${pgConfig.tables.temp_data} WHERE key = $1 AND (expires_at IS NULL OR expires_at > NOW())`,
            [key],
        );
        return result.rows.length > 0 ? result.rows[0].value : defaultValue;
    }

    async get(key, defaultValue = null) {
        try {
            if (!this.isAvailable()) {
                logger.warn('PostgreSQL not available, returning default value');
                return defaultValue;
            }

            const parsedKey = parseKey(key);

            if (parsedKey.type === 'cache') {
                const result = await this.pool.query(
                    `SELECT value FROM ${pgConfig.tables.cache_data} WHERE key = $1 AND (expires_at IS NULL OR expires_at > NOW())`,
                    [parsedKey.fullKey],
                );
                return result.rows.length > 0 ? result.rows[0].value : defaultValue;
            }

            if (parsedKey.type === 'guild_config') {
                const guildResult = await this.pool.query(
                    `SELECT config FROM ${pgConfig.tables.guilds} WHERE id = $1`,
                    [parsedKey.guildId]
                );
                return guildResult.rows.length > 0 ? guildResult.rows[0].config : defaultValue;
            }

            return await this._getTempValue(parsedKey.fullKey, defaultValue);
        } catch (error) {
            logger.error(`Error getting value for key ${key}:`, error);
            return defaultValue;
        }
    }

    async set(key, value, ttl = null) {
        try {
            if (!this.isAvailable()) {
                logger.warn('PostgreSQL not available, cannot set value');
                return false;
            }

            const parsedKey = parseKey(key);
            const expiresAt = ttl ? new Date(Date.now() + ttl * 1000) : null;
            const jsonValue = JSON.stringify(value ?? null);

            if (parsedKey.type === 'cache') {
                await this.pool.query(
                    `INSERT INTO ${pgConfig.tables.cache_data} (key, value, expires_at)
                     VALUES ($1, $2, $3)
                     ON CONFLICT (key) DO UPDATE SET value = $2, expires_at = $3`,
                    [parsedKey.fullKey, jsonValue, expiresAt],
                );
                return true;
            }

            if (parsedKey.type === 'guild_config') {
                await this.pool.query(
                    `INSERT INTO ${pgConfig.tables.guilds} (id, config, updated_at) 
                     VALUES ($1, $2, CURRENT_TIMESTAMP) 
                     ON CONFLICT (id) DO UPDATE SET config = $2, updated_at = CURRENT_TIMESTAMP`,
                    [parsedKey.guildId, value]
                );
                return true;
            }

            await this.pool.query(
                `INSERT INTO ${pgConfig.tables.temp_data} (key, value, expires_at)
                 VALUES ($1, $2, $3)
                 ON CONFLICT (key) DO UPDATE SET value = $2, expires_at = $3`,
                [parsedKey.fullKey, jsonValue, expiresAt],
            );
            return true;
        } catch (error) {
            logger.error(`Error setting value for key ${key}:`, error);
            return false;
        }
    }

    async delete(key) {
        try {
            if (!this.isAvailable()) {
                logger.warn('PostgreSQL not available, cannot delete key');
                return false;
            }

            const parsedKey = parseKey(key);

            if (parsedKey.type === 'cache') {
                await this.pool.query(`DELETE FROM ${pgConfig.tables.cache_data} WHERE key = $1`, [parsedKey.fullKey]);
                return true;
            }

            if (parsedKey.type === 'guild_config') {
                await this.pool.query(`DELETE FROM ${pgConfig.tables.guilds} WHERE id = $1`, [parsedKey.guildId]);
                return true;
            }

            await this.pool.query(`DELETE FROM ${pgConfig.tables.temp_data} WHERE key = $1`, [parsedKey.fullKey]);
            return true;
        } catch (error) {
            logger.error(`Error deleting key ${key}:`, error);
            return false;
        }
    }

    async list(prefix) {
        try {
            if (!this.isAvailable()) {
                logger.warn('PostgreSQL not available, returning empty list');
                return [];
            }

            const keys = new Set();

            const tempResult = await this.pool.query(
                `SELECT key FROM ${pgConfig.tables.temp_data} WHERE key LIKE $1 AND (expires_at IS NULL OR expires_at > NOW())`,
                [`${prefix}%`],
            );
            for (const row of tempResult.rows) {
                keys.add(row.key);
            }

            const cacheResult = await this.pool.query(
                `SELECT key FROM ${pgConfig.tables.cache_data} WHERE key LIKE $1 AND (expires_at IS NULL OR expires_at > NOW())`,
                [`${prefix}%`],
            );
            for (const row of cacheResult.rows) {
                keys.add(row.key);
            }

            return [...keys];
        } catch (error) {
            logger.error(`Error listing keys with prefix ${prefix}:`, error);
            return [];
        }
    }

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

const pgDb = new PostgreSQLDatabase();

export { PostgreSQLDatabase, pgDb };
