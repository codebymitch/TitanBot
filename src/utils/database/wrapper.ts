import type pg from 'pg';
import { pgDb } from '../postgresDatabase.js';
import { MemoryStorage } from '../memoryStorage.js';
import { logger } from '../logger.js';
import { validateGuildConfigOrThrow } from '../schemas.js';

/**
 * Key-value store contract shared by the PostgreSQL store and the in-memory fallback.
 * Values are JSON; `get<T>` lets callers state the stored shape (unchecked).
 */
export interface KeyValueStore {
    get<T = unknown>(key: string, defaultValue?: null): Promise<T | null>;
    get<T>(key: string, defaultValue: T): Promise<T>;
    get<T>(key: string, defaultValue?: T | null): Promise<T | null>;
    set(key: string, value: unknown, ttl?: number | null): Promise<boolean>;
    delete(key: string): Promise<boolean>;
    list(prefix: string): Promise<string[]>;
    // Optional: the wrapper falls back to get/set when a store lacks these.
    exists?(key: string): Promise<boolean>;
    increment?(key: string, amount?: number): Promise<number>;
    decrement?(key: string, amount?: number): Promise<number>;
    /** Only the PostgreSQL store has a pool. */
    pool?: pg.Pool | null;
    isAvailable?(): unknown;
}

type ConnectionType = 'none' | 'postgresql' | 'memory';

class DatabaseWrapper {
    initialized: boolean;
    db: KeyValueStore | null;
    useFallback: boolean;
    connectionType: ConnectionType;
    degradedModeWarningShown: boolean;
    degradedReason: string | null;

    constructor() {
        this.initialized = false;
        this.db = null;
        this.useFallback = false;
        this.connectionType = 'none';
        this.degradedModeWarningShown = false;
        this.degradedReason = null;
    }

    async initialize(): Promise<void> {
        if (this.initialized) {
            return;
        }

        try {
            logger.info('Attempting to connect to PostgreSQL...');
            const pgConnected = await pgDb.connect();
            if (pgConnected) {
                this.db = pgDb;
                this.connectionType = 'postgresql';
                this.degradedReason = null;
                logger.info('✅ PostgreSQL Database initialized - using persistent database');
                this.initialized = true;
                return;
            }

            const pgFailure = pgDb.getLastFailure?.();
            if (pgFailure?.reason === 'SCHEMA_VERSION_MISMATCH') {
                const schemaError: Error & { code?: string } = new Error(
                    `Schema version mismatch detected (${pgFailure.message}). Run migrations before startup.`,
                );
                schemaError.code = 'SCHEMA_VERSION_MISMATCH';
                throw schemaError;
            }
        } catch (error) {
            logger.warn('PostgreSQL connection failed:', error instanceof Error ? error.message : String(error));

            if ((error as { code?: string }).code === 'SCHEMA_VERSION_MISMATCH') {
                throw error;
            }
        }

        this.db = new MemoryStorage();
        this.useFallback = true;
        this.connectionType = 'memory';
        this.degradedReason = 'POSTGRES_UNAVAILABLE';
        logger.warn('⚠️ DATABASE DEGRADED MODE ENABLED - Using in-memory storage (data will be lost on restart)');
        logger.warn('⚠️ Please check PostgreSQL connection and restart the bot when fixed');
        this.initialized = true;
        this.degradedModeWarningShown = true;
    }

    async set(key: string, value: unknown, ttl: number | null = null): Promise<boolean> {
        if (this.useFallback) {
            logger.debug(`[DEGRADED] Writing to memory: ${key}`);
        }

        if (typeof key === 'string' && /^guild:[^:]+:config$/.test(key)) {
            const guildId = key.split(':')[1];
            validateGuildConfigOrThrow(value, {
                guildId,
                errorCode: 'VALIDATION_FAILED',
            });
        }

        return this.db!.set(key, value, ttl);
    }

    get<T = unknown>(key: string, defaultValue?: null): Promise<T | null>;
    get<T>(key: string, defaultValue: T): Promise<T>;
    get<T>(key: string, defaultValue?: T | null): Promise<T | null>;
    async get(key: string, defaultValue: unknown = null): Promise<unknown> {
        return this.db!.get(key, defaultValue);
    }

    async delete(key: string): Promise<boolean> {
        if (this.useFallback) {
            logger.debug(`[DEGRADED] Deleting from memory: ${key}`);
        }
        return this.db!.delete(key);
    }

    async list(prefix: string): Promise<string[]> {
        return this.db!.list(prefix);
    }

    async exists(key: string): Promise<boolean> {
        if (this.db!.exists) {
            return this.db!.exists(key);
        }
        const value = await this.db!.get(key);
        return value !== null;
    }

    async increment(key: string, amount = 1): Promise<number> {
        if (this.useFallback) {
            logger.debug(`[DEGRADED] Incrementing in memory: ${key}`);
        }
        if (this.db!.increment) {
            return this.db!.increment(key, amount);
        }
        const current = await this.db!.get(key, 0);
        const newValue = current + amount;
        await this.db!.set(key, newValue);
        return newValue;
    }

    async decrement(key: string, amount = 1): Promise<number> {
        if (this.useFallback) {
            logger.debug(`[DEGRADED] Decrementing in memory: ${key}`);
        }
        if (this.db!.decrement) {
            return this.db!.decrement(key, amount);
        }
        const current = await this.db!.get(key, 0);
        const newValue = current - amount;
        await this.db!.set(key, newValue);
        return newValue;
    }

    isDegraded() {
        return this.useFallback;
    }

    isAvailable() {
        return this.db && !this.useFallback;
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
        logger.info('Initializing Database (PostgreSQL > Memory fallback)...');
        await db.initialize();
        logger.info('✅ Database initialized');
        return { db };
    } catch (error) {
        logger.error('❌ Database Initialization Error:', error);

        if ((error as { code?: string }).code === 'SCHEMA_VERSION_MISMATCH') {
            throw error;
        }

        return { db };
    }
}

export async function getFromDb<T = unknown>(key: string, defaultValue?: null): Promise<T | null>;
export async function getFromDb<T>(key: string, defaultValue: T): Promise<T>;
export async function getFromDb<T>(key: string, defaultValue?: T | null): Promise<T | null>;
export async function getFromDb(key: string, defaultValue: unknown = null): Promise<unknown> {
    try {
        const value = await db.get(key);
        return value === null ? defaultValue : value;
    } catch (error) {
        logger.error(`Error getting value for key ${key}:`, error);
        return defaultValue;
    }
}

export async function setInDb(key: string, value: unknown, ttl: number | null = null): Promise<boolean> {
    try {
        await db.set(key, value, ttl);
        return true;
    } catch (error) {
        logger.error(`Error setting value for key ${key}:`, error);
        return false;
    }
}

export async function deleteFromDb(key: string): Promise<boolean> {
    try {
        await db.delete(key);
        return true;
    } catch (error) {
        logger.error(`Error deleting key ${key}:`, error);
        return false;
    }
}
