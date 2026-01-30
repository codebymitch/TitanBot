import { createClient } from 'redis';
import { logger } from './logger.js';

/**
 * Redis Database wrapper for Titan Bot
 * Replaces Replit Database with Redis for better performance and persistence
 */
class RedisDatabase {
    constructor() {
        this.client = null;
        this.isConnected = false;
        this.connectionPromise = null;
    }

    /**
     * Initialize Redis connection
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
            // Create Redis client with configuration
            this.client = createClient({
                url: process.env.REDIS_URL || 'redis://localhost:6379',
                socket: {
                    reconnectStrategy: (retries) => Math.min(retries * 50, 500)
                }
            });

            // Handle connection events
            this.client.on('error', (err) => {
                logger.error('Redis Client Error:', err);
                this.isConnected = false;
            });

            this.client.on('connect', () => {
                logger.info('Redis Client Connected');
            });

            this.client.on('ready', () => {
                logger.info('Redis Client Ready');
                this.isConnected = true;
            });

            this.client.on('end', () => {
                logger.warn('Redis Client Connection Ended');
                this.isConnected = false;
            });

            this.client.on('reconnecting', () => {
                logger.info('Redis Client Reconnecting');
            });

            // Connect to Redis
            await this.client.connect();
            
            logger.info('✅ Redis Database initialized successfully');
            return true;
        } catch (error) {
            logger.error('❌ Failed to initialize Redis Database:', error);
            this.isConnected = false;
            return false;
        }
    }

    /**
     * Check if Redis is connected
     * @returns {boolean} Connection status
     */
    isAvailable() {
        return this.isConnected && this.client;
    }

    /**
     * Get a value from Redis
     * @param {string} key - The key to retrieve
     * @param {any} defaultValue - Default value if key doesn't exist
     * @returns {Promise<any>} The value or default
     */
    async get(key, defaultValue = null) {
        try {
            if (!this.isAvailable()) {
                logger.warn('Redis not available, returning default value');
                return defaultValue;
            }

            const value = await this.client.get(key);
            
            if (value === null) {
                return defaultValue;
            }

            // Parse JSON if it looks like JSON
            try {
                return JSON.parse(value);
            } catch {
                return value;
            }
        } catch (error) {
            logger.error(`Error getting value for key ${key}:`, error);
            return defaultValue;
        }
    }

    /**
     * Set a value in Redis
     * @param {string} key - The key to set
     * @param {any} value - The value to store
     * @param {number} ttl - Optional TTL in seconds
     * @returns {Promise<boolean>} Success status
     */
    async set(key, value, ttl = null) {
        try {
            if (!this.isAvailable()) {
                logger.warn('Redis not available, cannot set value');
                return false;
            }

            // Convert value to JSON if it's an object
            const serializedValue = typeof value === 'string' ? value : JSON.stringify(value);

            if (ttl) {
                await this.client.setEx(key, ttl, serializedValue);
            } else {
                await this.client.set(key, serializedValue);
            }

            return true;
        } catch (error) {
            logger.error(`Error setting value for key ${key}:`, error);
            return false;
        }
    }

    /**
     * Delete a key from Redis
     * @param {string} key - The key to delete
     * @returns {Promise<boolean>} Success status
     */
    async delete(key) {
        try {
            if (!this.isAvailable()) {
                logger.warn('Redis not available, cannot delete key');
                return false;
            }

            await this.client.del(key);
            return true;
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
                logger.warn('Redis not available, returning empty list');
                return [];
            }

            const pattern = `${prefix}*`;
            const keys = await this.client.keys(pattern);
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

            const result = await this.client.exists(key);
            return result === 1;
        } catch (error) {
            logger.error(`Error checking if key exists ${key}:`, error);
            return false;
        }
    }

    /**
     * Set expiration on a key
     * @param {string} key - The key to set expiration on
     * @param {number} ttl - TTL in seconds
     * @returns {Promise<boolean>} Success status
     */
    async expire(key, ttl) {
        try {
            if (!this.isAvailable()) {
                return false;
            }

            await this.client.expire(key, ttl);
            return true;
        } catch (error) {
            logger.error(`Error setting expiration on key ${key}:`, error);
            return false;
        }
    }

    /**
     * Get TTL of a key
     * @param {string} key - The key to check
     * @returns {Promise<number>} TTL in seconds, -1 if no expiration, -2 if key doesn't exist
     */
    async ttl(key) {
        try {
            if (!this.isAvailable()) {
                return -2;
            }

            return await this.client.ttl(key);
        } catch (error) {
            logger.error(`Error getting TTL for key ${key}:`, error);
            return -2;
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

            if (amount === 1) {
                return await this.client.incr(key);
            } else {
                return await this.client.incrBy(key, amount);
            }
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

            if (amount === 1) {
                return await this.client.decr(key);
            } else {
                return await this.client.decrBy(key, amount);
            }
        } catch (error) {
            logger.error(`Error decrementing key ${key}:`, error);
            return -amount;
        }
    }

    /**
     * Close Redis connection
     */
    async disconnect() {
        try {
            if (this.client && this.isConnected) {
                await this.client.quit();
                logger.info('Redis connection closed');
            }
        } catch (error) {
            logger.error('Error closing Redis connection:', error);
        }
    }

    /**
     * Get Redis info for debugging
     * @returns {Promise<Object>} Redis server info
     */
    async getInfo() {
        try {
            if (!this.isAvailable()) {
                return null;
            }

            const info = await this.client.info();
            return info;
        } catch (error) {
            logger.error('Error getting Redis info:', error);
            return null;
        }
    }
}

// Create singleton instance
const redisDb = new RedisDatabase();

export { RedisDatabase, redisDb };
