import { pgDb } from '../utils/postgresDatabase.js';
import { logger } from '../utils/logger.js';

/**
 * Database Migration Manager for Titan Bot
 * Handles database schema migrations and versioning
 */
class MigrationManager {
    constructor() {
        this.migrations = [];
        this.currentVersion = 0;
    }

    /**
     * Initialize the migration system
     */
    async initialize() {
        try {
            await pgDb.connect();
            await this.createMigrationsTable();
            await this.loadMigrations();
            logger.info('Migration system initialized');
        } catch (error) {
            logger.error('Failed to initialize migration system:', error);
            throw error;
        }
    }

    /**
     * Create the migrations tracking table
     */
    async createMigrationsTable() {
        const query = `
            CREATE TABLE IF NOT EXISTS migrations (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL UNIQUE,
                version INTEGER NOT NULL UNIQUE,
                executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                execution_time_ms INTEGER
            )
        `;
        
        await pgDb.pool.query(query);
        logger.info('Migrations table created/verified');
    }

    /**
     * Load migration history
     */
    async loadMigrations() {
        try {
            const result = await pgDb.pool.query(
                'SELECT version FROM migrations ORDER BY version DESC LIMIT 1'
            );
            
            this.currentVersion = result.rows.length > 0 ? result.rows[0].version : 0;
            logger.info(`Current database version: ${this.currentVersion}`);
        } catch (error) {
            logger.error('Error loading migrations:', error);
            this.currentVersion = 0;
        }
    }

    /**
     * Register a migration
     * @param {Object} migration - Migration object
     */
    registerMigration(migration) {
        this.migrations.push(migration);
        this.migrations.sort((a, b) => a.version - b.version);
    }

    /**
     * Run all pending migrations
     */
    async migrate() {
        const pendingMigrations = this.migrations.filter(m => m.version > this.currentVersion);
        
        if (pendingMigrations.length === 0) {
            logger.info('No pending migrations');
            return;
        }

        logger.info(`Running ${pendingMigrations.length} pending migrations...`);
        
        for (const migration of pendingMigrations) {
            await this.runMigration(migration);
        }
        
        logger.info('All migrations completed successfully');
    }

    /**
     * Run a single migration
     * @param {Object} migration - Migration to run
     */
    async runMigration(migration) {
        const startTime = Date.now();
        
        try {
            logger.info(`Running migration ${migration.version}: ${migration.name}`);
            
            // Start transaction
            const client = await pgDb.pool.connect();
            
            try {
                await client.query('BEGIN');
                
                // Run migration
                await migration.up(client);
                
                // Record migration
                const executionTime = Date.now() - startTime;
                await client.query(
                    'INSERT INTO migrations (name, version, execution_time_ms) VALUES ($1, $2, $3)',
                    [migration.name, migration.version, executionTime]
                );
                
                await client.query('COMMIT');
                
                this.currentVersion = migration.version;
                logger.info(`Migration ${migration.version} completed in ${executionTime}ms`);
                
            } catch (error) {
                await client.query('ROLLBACK');
                throw error;
            } finally {
                client.release();
            }
            
        } catch (error) {
            logger.error(`Migration ${migration.version} failed:`, error);
            throw error;
        }
    }

    /**
     * Rollback a migration (if rollback function is provided)
     * @param {number} version - Migration version to rollback
     */
    async rollback(version) {
        const migration = this.migrations.find(m => m.version === version);
        
        if (!migration) {
            throw new Error(`Migration version ${version} not found`);
        }
        
        if (!migration.down) {
            throw new Error(`Migration ${version} does not support rollback`);
        }
        
        try {
            logger.info(`Rolling back migration ${version}: ${migration.name}`);
            
            const client = await pgDb.pool.connect();
            
            try {
                await client.query('BEGIN');
                
                // Run rollback
                await migration.down(client);
                
                // Remove migration record
                await client.query('DELETE FROM migrations WHERE version = $1', [version]);
                
                await client.query('COMMIT');
                
                this.currentVersion = version - 1;
                logger.info(`Migration ${version} rolled back successfully`);
                
            } catch (error) {
                await client.query('ROLLBACK');
                throw error;
            } finally {
                client.release();
            }
            
        } catch (error) {
            logger.error(`Rollback of migration ${version} failed:`, error);
            throw error;
        }
    }

    /**
     * Get migration status
     */
    async getStatus() {
        const executedMigrations = await pgDb.pool.query(
            'SELECT * FROM migrations ORDER BY version'
        );
        
        const pendingMigrations = this.migrations.filter(m => 
            !executedMigrations.rows.some(em => em.version === m.version)
        );
        
        return {
            currentVersion: this.currentVersion,
            executed: executedMigrations.rows,
            pending: pendingMigrations,
            totalMigrations: this.migrations.length
        };
    }
}

// Create migration manager instance
const migrationManager = new MigrationManager();

// Define migrations
const migrations = [
    {
        version: 1,
        name: 'initial_schema',
        up: async (client) => {
            // All tables are created automatically in postgresDatabase.js
            // This migration is for any additional setup needed
            logger.info('Initial schema migration completed');
        },
        down: async (client) => {
            // Drop all tables in reverse order
            const tables = [
                'migrations',
                'cache_data',
                'temp_data',
                'application_roles',
                'invite_tracking',
                'economy',
                'user_levels',
                'leveling_configs',
                'welcome_configs',
                'afk_status',
                'tickets',
                'giveaways',
                'birthdays',
                'guild_users',
                'users',
                'guilds'
            ];
            
            for (const table of tables) {
                await client.query(`DROP TABLE IF EXISTS ${table} CASCADE`);
            }
        }
    },
    
    {
        version: 2,
        name: 'add_indexes',
        up: async (client) => {
            // Add performance indexes
            const indexes = [
                'CREATE INDEX IF NOT EXISTS idx_guild_users_guild_id ON guild_users(guild_id)',
                'CREATE INDEX IF NOT EXISTS idx_guild_users_user_id ON guild_users(user_id)',
                'CREATE INDEX IF NOT EXISTS idx_birthdays_guild_id ON birthdays(guild_id)',
                'CREATE INDEX IF NOT EXISTS idx_birthdays_month_day ON birthdays(month, day)',
                'CREATE INDEX IF NOT EXISTS idx_giveaways_guild_id ON giveaways(guild_id)',
                'CREATE INDEX IF NOT EXISTS idx_giveaways_ends_at ON giveaways(ends_at)',
                'CREATE INDEX IF NOT EXISTS idx_tickets_guild_id ON tickets(guild_id)',
                'CREATE INDEX IF NOT EXISTS idx_tickets_expires_at ON tickets(expires_at)',
                'CREATE INDEX IF NOT EXISTS idx_afk_status_guild_id ON afk_status(guild_id)',
                'CREATE INDEX IF NOT EXISTS idx_afk_status_expires_at ON afk_status(expires_at)',
                'CREATE INDEX IF NOT EXISTS idx_user_levels_guild_id ON user_levels(guild_id)',
                'CREATE INDEX IF NOT EXISTS idx_user_levels_xp ON user_levels(xp)',
                'CREATE INDEX IF NOT EXISTS idx_economy_guild_id ON economy(guild_id)',
                'CREATE INDEX IF NOT EXISTS idx_temp_data_expires_at ON temp_data(expires_at)',
                'CREATE INDEX IF NOT EXISTS idx_cache_data_expires_at ON cache_data(expires_at)'
            ];
            
            for (const index of indexes) {
                await client.query(index);
            }
            
            logger.info('Performance indexes created');
        },
        down: async (client) => {
            // Drop indexes
            const indexes = [
                'idx_guild_users_guild_id',
                'idx_guild_users_user_id',
                'idx_birthdays_guild_id',
                'idx_birthdays_month_day',
                'idx_giveaways_guild_id',
                'idx_giveaways_ends_at',
                'idx_tickets_guild_id',
                'idx_tickets_expires_at',
                'idx_afk_status_guild_id',
                'idx_afk_status_expires_at',
                'idx_user_levels_guild_id',
                'idx_user_levels_xp',
                'idx_economy_guild_id',
                'idx_temp_data_expires_at',
                'idx_cache_data_expires_at'
            ];
            
            for (const index of indexes) {
                try {
                    await client.query(`DROP INDEX IF EXISTS ${index}`);
                } catch (error) {
                    // Ignore errors for non-existent indexes
                }
            }
        }
    },
    
    {
        version: 3,
        name: 'add_audit_triggers',
        up: async (client) => {
            // Add update timestamp triggers
            const triggers = [
                `CREATE OR REPLACE FUNCTION update_updated_at_column()
                RETURNS TRIGGER AS $$
                BEGIN
                    NEW.updated_at = CURRENT_TIMESTAMP;
                    RETURN NEW;
                END;
                $$ language 'plpgsql';`,
                
                `CREATE TRIGGER update_guilds_updated_at 
                 BEFORE UPDATE ON guilds 
                 FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();`,
                 
                `CREATE TRIGGER update_users_updated_at 
                 BEFORE UPDATE ON users 
                 FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();`,
                 
                `CREATE TRIGGER update_welcome_configs_updated_at 
                 BEFORE UPDATE ON welcome_configs 
                 FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();`,
                 
                `CREATE TRIGGER update_leveling_configs_updated_at 
                 BEFORE UPDATE ON leveling_configs 
                 FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();`,
                 
                `CREATE TRIGGER update_user_levels_updated_at 
                 BEFORE UPDATE ON user_levels 
                 FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();`,
                 
                `CREATE TRIGGER update_economy_updated_at 
                 BEFORE UPDATE ON economy 
                 FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();`,
                 
                `CREATE TRIGGER update_application_roles_updated_at 
                 BEFORE UPDATE ON application_roles 
                 FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();`
            ];
            
            for (const trigger of triggers) {
                await client.query(trigger);
            }
            
            logger.info('Audit triggers created');
        },
        down: async (client) => {
            // Drop triggers and function
            const triggers = [
                'update_guilds_updated_at',
                'update_users_updated_at',
                'update_welcome_configs_updated_at',
                'update_leveling_configs_updated_at',
                'update_user_levels_updated_at',
                'update_economy_updated_at',
                'update_application_roles_updated_at'
            ];
            
            for (const trigger of triggers) {
                try {
                    await client.query(`DROP TRIGGER IF EXISTS ${trigger} ON guilds`);
                    await client.query(`DROP TRIGGER IF EXISTS ${trigger} ON users`);
                    await client.query(`DROP TRIGGER IF EXISTS ${trigger} ON welcome_configs`);
                    await client.query(`DROP TRIGGER IF EXISTS ${trigger} ON leveling_configs`);
                    await client.query(`DROP TRIGGER IF EXISTS ${trigger} ON user_levels`);
                    await client.query(`DROP TRIGGER IF EXISTS ${trigger} ON economy`);
                    await client.query(`DROP TRIGGER IF EXISTS ${trigger} ON application_roles`);
                } catch (error) {
                    // Ignore errors for non-existent triggers
                }
            }
            
            try {
                await client.query('DROP FUNCTION IF EXISTS update_updated_at_column()');
            } catch (error) {
                // Ignore error for non-existent function
            }
        }
    }
];

// Register all migrations
migrations.forEach(migration => {
    migrationManager.registerMigration(migration);
});

export { MigrationManager, migrationManager };
