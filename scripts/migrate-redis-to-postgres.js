#!/usr/bin/env node

/**
 * Redis to PostgreSQL Migration Script
 * Migrates all data from Redis to PostgreSQL database
 */

import { redisDb } from '../src/utils/redisDatabase.js';
import { pgDb } from '../src/utils/postgresDatabase.js';
import { migrationManager } from '../src/utils/migrations.js';
import { logger } from '../src/utils/logger.js';

class RedisToPostgresMigrator {
    constructor() {
        this.stats = {
            totalKeys: 0,
            migratedKeys: 0,
            failedKeys: 0,
            skippedKeys: 0,
            startTime: null,
            endTime: null
        };
    }

    async initialize() {
        logger.info('🚀 Starting Redis to PostgreSQL Migration...');
        this.stats.startTime = Date.now();

        try {
            // Connect to both databases
            logger.info('Connecting to Redis...');
            const redisConnected = await redisDb.connect();
            if (!redisConnected) {
                throw new Error('Failed to connect to Redis');
            }

            logger.info('Connecting to PostgreSQL...');
            const pgConnected = await pgDb.connect();
            if (!pgConnected) {
                throw new Error('Failed to connect to PostgreSQL');
            }

            // Run migrations first
            logger.info('Running PostgreSQL migrations...');
            await migrationManager.initialize();
            await migrationManager.migrate();

            logger.info('✅ All connections established and migrations completed');
            return true;
        } catch (error) {
            logger.error('❌ Failed to initialize migration:', error);
            return false;
        }
    }

    async migrateAllData() {
        try {
            // Get all Redis keys
            logger.info('Scanning Redis for all keys...');
            const allKeys = await redisDb.client.keys('*');
            this.stats.totalKeys = allKeys.length;

            logger.info(`Found ${this.stats.totalKeys} keys to migrate`);

            // Group keys by type for better handling
            const keyGroups = this.groupKeysByType(allKeys);
            logger.info('Key groups:', keyGroups);

            // Migrate each group
            for (const [groupType, keys] of Object.entries(keyGroups)) {
                await this.migrateKeyGroup(groupType, keys);
            }

            this.stats.endTime = Date.now();
            this.printMigrationSummary();
            
            return this.stats.failedKeys === 0;
        } catch (error) {
            logger.error('❌ Migration failed:', error);
            return false;
        }
    }

    groupKeysByType(keys) {
        const groups = {
            guild_config: [],
            guild_birthdays: [],
            guild_giveaways: [],
            welcome_config: [],
            leveling_config: [],
            user_levels: [],
            economy: [],
            afk_status: [],
            tickets: [],
            temp: [],
            cache: [],
            other: []
        };

        for (const key of keys) {
            if (key.startsWith('guild:') && key.includes(':config')) {
                groups.guild_config.push(key);
            } else if (key.startsWith('guild:') && key.includes(':birthdays')) {
                groups.guild_birthdays.push(key);
            } else if (key.startsWith('guild:') && key.includes(':giveaways')) {
                groups.guild_giveaways.push(key);
            } else if (key.startsWith('guild:') && key.includes(':welcome')) {
                groups.welcome_config.push(key);
            } else if (key.startsWith('guild:') && key.includes(':leveling:config')) {
                groups.leveling_config.push(key);
            } else if (key.startsWith('guild:') && key.includes(':leveling:users:')) {
                groups.user_levels.push(key);
            } else if (key.startsWith('guild:') && key.includes(':economy:')) {
                groups.economy.push(key);
            } else if (key.includes(':afk:')) {
                groups.afk_status.push(key);
            } else if (key.startsWith('guild:') && key.includes(':ticket:')) {
                groups.tickets.push(key);
            } else if (key.startsWith('temp:')) {
                groups.temp.push(key);
            } else if (key.startsWith('cache:')) {
                groups.cache.push(key);
            } else {
                groups.other.push(key);
            }
        }

        return groups;
    }

    async migrateKeyGroup(groupType, keys) {
        if (keys.length === 0) return;

        logger.info(`Migrating ${groupType} group (${keys.length} keys)...`);

        for (const key of keys) {
            try {
                await this.migrateKey(key, groupType);
                this.stats.migratedKeys++;
            } catch (error) {
                logger.error(`Failed to migrate key ${key}:`, error);
                this.stats.failedKeys++;
            }

            // Progress indicator
            if ((this.stats.migratedKeys + this.stats.failedKeys) % 100 === 0) {
                logger.info(`Progress: ${this.stats.migratedKeys + this.stats.failedKeys}/${this.stats.totalKeys} keys processed`);
            }
        }
    }

    async migrateKey(key, groupType) {
        try {
            // Get value and TTL from Redis
            const value = await redisDb.get(key);
            if (value === null) {
                this.stats.skippedKeys++;
                return;
            }

            const ttl = await redisDb.ttl(key);
            const ttlSeconds = ttl > 0 ? ttl : null;

            // Store in PostgreSQL
            await pgDb.set(key, value, ttlSeconds);
            
            if (this.stats.migratedKeys % 50 === 0) {
                logger.debug(`Migrated key: ${key}`);
            }
        } catch (error) {
            logger.error(`Error migrating key ${key}:`, error);
            throw error;
        }
    }

    async verifyMigration() {
        logger.info('🔍 Verifying migration integrity...');
        
        try {
            // Get counts from both databases
            const redisKeys = await redisDb.client.keys('*');
            const pgKeys = await pgDb.list('');
            
            const redisCount = redisKeys.length;
            const pgCount = pgKeys.length;

            logger.info(`Redis keys: ${redisCount}, PostgreSQL keys: ${pgCount}`);

            // Sample verification of random keys
            const sampleSize = Math.min(10, redisKeys.length);
            const sampleKeys = this.getRandomSample(redisKeys, sampleSize);

            let verifiedCount = 0;
            for (const key of sampleKeys) {
                const redisValue = await redisDb.get(key);
                const pgValue = await pgDb.get(key);

                if (JSON.stringify(redisValue) === JSON.stringify(pgValue)) {
                    verifiedCount++;
                } else {
                    logger.warn(`Data mismatch for key: ${key}`);
                }
            }

            logger.info(`Sample verification: ${verifiedCount}/${sampleSize} keys match`);
            
            return {
                redisCount,
                pgCount,
                sampleVerified: verifiedCount,
                sampleTotal: sampleSize
            };
        } catch (error) {
            logger.error('Verification failed:', error);
            return null;
        }
    }

    getRandomSample(array, size) {
        const shuffled = [...array].sort(() => 0.5 - Math.random());
        return shuffled.slice(0, size);
    }

    printMigrationSummary() {
        const duration = this.stats.endTime - this.stats.startTime;
        const durationSeconds = (duration / 1000).toFixed(2);
        
        logger.info('\n' + '='.repeat(50));
        logger.info('📊 MIGRATION SUMMARY');
        logger.info('='.repeat(50));
        logger.info(`Total keys found: ${this.stats.totalKeys}`);
        logger.info(`Successfully migrated: ${this.stats.migratedKeys}`);
        logger.info(`Failed to migrate: ${this.stats.failedKeys}`);
        logger.info(`Skipped: ${this.stats.skippedKeys}`);
        logger.info(`Duration: ${durationSeconds} seconds`);
        
        if (this.stats.totalKeys > 0) {
            const successRate = ((this.stats.migratedKeys / this.stats.totalKeys) * 100).toFixed(2);
            logger.info(`Success rate: ${successRate}%`);
        }
        
        logger.info('='.repeat(50));
    }

    async cleanup() {
        logger.info('Cleaning up connections...');
        try {
            await redisDb.disconnect();
            await pgDb.disconnect();
        } catch (error) {
            logger.error('Error during cleanup:', error);
        }
    }
}

// Main execution
async function main() {
    const migrator = new RedisToPostgresMigrator();

    try {
        // Initialize
        const initialized = await migrator.initialize();
        if (!initialized) {
            process.exit(1);
        }

        // Ask for confirmation if in interactive mode
        if (process.stdout.isTTY) {
            const readline = await import('readline');
            const rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout
            });

            const answer = await new Promise(resolve => {
                rl.question('This will migrate all Redis data to PostgreSQL. Continue? (y/N): ', resolve);
            });
            rl.close();

            if (answer.toLowerCase() !== 'y') {
                logger.info('Migration cancelled by user');
                process.exit(0);
            }
        }

        // Perform migration
        const success = await migrator.migrateAllData();
        
        if (success) {
            // Verify migration
            const verification = await migrator.verifyMigration();
            if (verification) {
                logger.info('✅ Migration completed successfully!');
            } else {
                logger.warn('⚠️ Migration completed but verification failed');
            }
        } else {
            logger.error('❌ Migration failed');
            process.exit(1);
        }

    } catch (error) {
        logger.error('❌ Migration script failed:', error);
        process.exit(1);
    } finally {
        await migrator.cleanup();
    }
}

// Handle uncaught errors
process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception:', error);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

// Run the migration
if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}

export { RedisToPostgresMigrator };
