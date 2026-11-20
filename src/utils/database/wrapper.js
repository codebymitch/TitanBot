
import { pgDb } from '../postgresDatabase.js';
import { MemoryStorage } from '../memoryStorage.js';
import { logger } from '../logger.js';
import { validateGuildConfigOrThrow } from '../schemas.js';

class DatabaseWrapper {
    constructor() {
        this.initialized = false;
        this.db = null;
        this.useFallback = false;
        this.connectionType = 'none';
        this.degradedModeWarningShown = false;
        this.degradedReason = null;
    }

    async initialize() {
        if (this.initialized) return;

        const production = process.env.NODE_ENV === 'production';
        const databaseRequired =
            production ||
            process.env.DATABASE_REQUIRED === 'true';

        try {
            logger.info('Attempting to connect to PostgreSQL...');

            const pgConnected = await pgDb.connect();

            if (pgConnected) {
                this.db = pgDb;
                this.connectionType = 'postgresql';
                this.useFallback = false;
                this.degradedReason = null;
                this.initialized = true;

                logger.info(
                    'PostgreSQL initialized - persistent storage active'
                );

                return;
            }

            const pgFailure = pgDb.getLastFailure?.();

            if (pgFailure?.reason === 'SCHEMA_VERSION_MISMATCH') {
                const error = new Error(
                    `Schema version mismatch: ${pgFailure.message}. Run migrations before startup.`
                );

                error.code = 'SCHEMA_VERSION_MISMATCH';
                throw error;
            }

            if (databaseRequired) {
                const error = new Error(
                    `PostgreSQL unavailable: ${
                        pgFailure?.message || 'Connection failed'
                    }`
                );

                error.code = 'DATABASE_REQUIRED_UNAVAILABLE';
                throw error;
            }

        } catch (error) {
            logger.error(
                'PostgreSQL initialization failed:',
                error.message
            );

            if (
                error.code === 'SCHEMA_VERSION_MISMATCH' ||
                error.code === 'DATABASE_REQUIRED_UNAVAILABLE'
            ) {
                throw error;
            }

            if (databaseRequired) {
                const requiredError = new Error(
                    `Production requires PostgreSQL. ${error.message}`
                );

                requiredError.code = 'DATABASE_REQUIRED_UNAVAILABLE';
                throw requiredError;
            }
        }

        // Development-only fallback
        this.db = new MemoryStorage();
        this.useFallback = true;
        this.connectionType = 'memory';
        this.degradedReason = 'POSTGRES_UNAVAILABLE';
        this.initialized = true;
        this.degradedModeWarningShown = true;

        logger.warn(
            'Development fallback enabled - using MemoryStorage'
        );
        logger.warn(
            'Data stored in memory will be lost after restart'
        );
    }

    async set(key, value, ttl = null) {
        if (!this.db) {
            throw new Error('Database has not been initialized');
        }

        if (typeof key === 'string' && /^guild:[^:]+:config$/.test(key)) {
            const guildId = key.split(':')[1];

            validateGuildConfigOrThrow(value, {
                guildId,
                errorCode: 'VALIDATION_FAILED',
            });
        }

        return this.db.set(key, value, ttl);
    }

    async get(key, defaultValue = null) {
        if (!this.db) {
            throw new Error('Database has not been initialized');
        }

        return this.db.get(key, defaultValue);
    }

    async delete(key) {
        if (!this.db) {
            throw new Error('Database has not been initialized');
        }

        return this.db.delete(key);
    }

    async list(prefix) {
        if (!this.db) {
            throw new Error('Database has not been initialized');
        }

        return this.db.list(prefix);
    }

    async exists(key) {
        if (!this.db) {
            throw new Error('Database has not been initialized');
        }

        if (this.db.exists) {
            return this.db.exists(key);
        }

        const value = await this.db.get(key);
        return value !== null;
    }

    async increment(key, amount = 1) {
        if (!this.db) {
            throw new Error('Database has not been initialized');
        }

        if (this.db.increment) {
            return this.db.increment(key, amount);
        }

        const current = await this.db.get(key, 0);
        const newValue = current + amount;

        await this.db.set(key, newValue);

        return newValue;
    }

    async decrement(key, amount = 1) {
        if (!this.db) {
            throw new Error('Database has not been initialized');
        }

        if (this.db.decrement) {
            return this.db.decrement(key, amount);
        }

        const current = await this.db.get(key, 0);
        const newValue = current - amount;

        await this.db.set(key, newValue);

        return newValue;
    }

    isDegraded() {
        return this.useFallback;
    }

    isAvailable() {
        return Boolean(this.db && !this.useFallback);
    }

    getStatus() {
        return {
            initialized: this.initialized,
            connectionType: this.connectionType,
            isDegraded: this.useFallback,
            isAvailable: this.isAvailable(),
            degradedReason: this.degradedReason,
        };
    }

    getConnectionType() {
        return this.connectionType;
    }
}

export const db = new DatabaseWrapper();

export async function initializeDatabase() {
    try {
        logger.info('Initializing Database...');

        await db.initialize();

        logger.info(
            `Database initialized: ${db.getConnectionType()}`
        );

        return { db };

    } catch (error) {
        logger.error('Database initialization error:', error);

        throw error;
    }
}

export async function getFromDb(key, defaultValue = null) {
    try {
        const value = await db.get(key);

        return value === null ? defaultValue : value;

    } catch (error) {
        logger.error(`Error getting key ${key}:`, error);

        return defaultValue;
    }
}

export async function setInDb(key, value, ttl = null) {
    try {
        await db.set(key, value, ttl);

        return true;

    } catch (error) {
        logger.error(`Error setting key ${key}:`, error);

        return false;
    }
}

export async function deleteFromDb(key) {
    try {
        await db.delete(key);

        return true;

    } catch (error) {
        logger.error(`Error deleting key ${key}:`, error);

        return false;
    }
}
