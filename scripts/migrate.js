import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: process.env.POSTGRES_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

const createTables = async (client) => {
  console.log('📊 Creating database tables...');

  const tables = [
    // Guild Configurations
    `CREATE TABLE IF NOT EXISTS guild_configs (
      guild_id VARCHAR(255) PRIMARY KEY,
      prefix VARCHAR(10) DEFAULT '!',
      welcome_channel VARCHAR(255),
      welcome_message TEXT,
      welcome_enabled BOOLEAN DEFAULT false,
      autorole_ids TEXT[] DEFAULT '{}',
      modlog_channel VARCHAR(255),
      settings JSONB DEFAULT '{}',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,

    // User Leveling
    `CREATE TABLE IF NOT EXISTS user_levels (
      id SERIAL PRIMARY KEY,
      user_id VARCHAR(255) NOT NULL,
      guild_id VARCHAR(255) NOT NULL,
      xp BIGINT DEFAULT 0,
      level INT DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, guild_id)
    )`,

    // User Economy
    `CREATE TABLE IF NOT EXISTS user_economy (
      id SERIAL PRIMARY KEY,
      user_id VARCHAR(255) NOT NULL,
      guild_id VARCHAR(255) NOT NULL,
      balance BIGINT DEFAULT 0,
      bank BIGINT DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, guild_id)
    )`,

    // Birthdays
    `CREATE TABLE IF NOT EXISTS birthdays (
      id SERIAL PRIMARY KEY,
      user_id VARCHAR(255) NOT NULL,
      guild_id VARCHAR(255) NOT NULL,
      month INT NOT NULL,
      day INT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, guild_id)
    )`,

    // Tickets
    `CREATE TABLE IF NOT EXISTS tickets (
      id SERIAL PRIMARY KEY,
      ticket_id VARCHAR(255) UNIQUE NOT NULL,
      guild_id VARCHAR(255) NOT NULL,
      user_id VARCHAR(255) NOT NULL,
      channel_id VARCHAR(255) NOT NULL,
      status VARCHAR(50) DEFAULT 'open',
      subject TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      closed_at TIMESTAMP
    )`,

    // Giveaways
    `CREATE TABLE IF NOT EXISTS giveaways (
      id SERIAL PRIMARY KEY,
      giveaway_id VARCHAR(255) UNIQUE NOT NULL,
      guild_id VARCHAR(255) NOT NULL,
      channel_id VARCHAR(255) NOT NULL,
      message_id VARCHAR(255) NOT NULL,
      prize TEXT NOT NULL,
      winners_count INT DEFAULT 1,
      ended BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      ends_at TIMESTAMP NOT NULL
    )`,

    // Giveaway Participants
    `CREATE TABLE IF NOT EXISTS giveaway_entries (
      id SERIAL PRIMARY KEY,
      giveaway_id VARCHAR(255) NOT NULL,
      user_id VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(giveaway_id, user_id),
      FOREIGN KEY(giveaway_id) REFERENCES giveaways(giveaway_id) ON DELETE CASCADE
    )`,

    // Reaction Roles
    `CREATE TABLE IF NOT EXISTS reaction_roles (
      id SERIAL PRIMARY KEY,
      guild_id VARCHAR(255) NOT NULL,
      channel_id VARCHAR(255) NOT NULL,
      message_id VARCHAR(255) NOT NULL,
      emoji VARCHAR(255) NOT NULL,
      role_id VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(message_id, emoji)
    )`,

    // Welcome System
    `CREATE TABLE IF NOT EXISTS welcome_system (
      id SERIAL PRIMARY KEY,
      guild_id VARCHAR(255) UNIQUE NOT NULL,
      channel_id VARCHAR(255),
      message TEXT,
      enabled BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,

    // Counter
    `CREATE TABLE IF NOT EXISTS counters (
      id SERIAL PRIMARY KEY,
      guild_id VARCHAR(255) UNIQUE NOT NULL,
      user_count_channel VARCHAR(255),
      bot_count_channel VARCHAR(255),
      online_count_channel VARCHAR(255),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,

    // Audit Log
    `CREATE TABLE IF NOT EXISTS audit_logs (
      id SERIAL PRIMARY KEY,
      guild_id VARCHAR(255) NOT NULL,
      user_id VARCHAR(255),
      action VARCHAR(255) NOT NULL,
      target_id VARCHAR(255),
      reason TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`
  ];

  for (const table of tables) {
    try {
      await client.query(table);
    } catch (error) {
      console.error('❌ Error creating table:', error.message);
      throw error;
    }
  }

  console.log('✅ All tables created successfully');
};

const createIndexes = async (client) => {
  console.log('📈 Creating indexes...');

  const indexes = [
    'CREATE INDEX IF NOT EXISTS idx_user_levels_guild ON user_levels(guild_id)',
    'CREATE INDEX IF NOT EXISTS idx_user_economy_guild ON user_economy(guild_id)',
    'CREATE INDEX IF NOT EXISTS idx_tickets_guild ON tickets(guild_id)',
    'CREATE INDEX IF NOT EXISTS idx_giveaways_guild ON giveaways(guild_id)',
    'CREATE INDEX IF NOT EXISTS idx_audit_logs_guild ON audit_logs(guild_id)',
  ];

  for (const index of indexes) {
    try {
      await client.query(index);
    } catch (error) {
      console.error('❌ Error creating index:', error.message);
      throw error;
    }
  }

  console.log('✅ All indexes created successfully');
};

const createTriggers = async (client) => {
  console.log('⏰ Setting up automatic timestamps...');

  const triggers = [
    {
      table: 'guild_configs',
      name: 'update_guild_configs_timestamp'
    },
    {
      table: 'user_levels',
      name: 'update_user_levels_timestamp'
    },
    {
      table: 'user_economy',
      name: 'update_user_economy_timestamp'
    },
    {
      table: 'birthdays',
      name: 'update_birthdays_timestamp'
    },
    {
      table: 'tickets',
      name: 'update_tickets_timestamp'
    },
    {
      table: 'giveaways',
      name: 'update_giveaways_timestamp'
    },
    {
      table: 'reaction_roles',
      name: 'update_reaction_roles_timestamp'
    },
    {
      table: 'welcome_system',
      name: 'update_welcome_system_timestamp'
    },
    {
      table: 'counters',
      name: 'update_counters_timestamp'
    }
  ];

  for (const { table, name } of triggers) {
    try {
      // Create trigger function if it doesn't exist
      await client.query(`
        CREATE OR REPLACE FUNCTION update_timestamp_${table}()
        RETURNS TRIGGER AS $$
        BEGIN
          NEW.updated_at = CURRENT_TIMESTAMP;
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
      `);

      // Create trigger
      await client.query(`
        DROP TRIGGER IF EXISTS ${name} ON ${table};
        CREATE TRIGGER ${name}
        BEFORE UPDATE ON ${table}
        FOR EACH ROW
        EXECUTE FUNCTION update_timestamp_${table}();
      `);
    } catch (error) {
      console.error(`❌ Error creating trigger for ${table}:`, error.message);
      throw error;
    }
  }

  console.log('✅ All triggers created successfully');
};

const migrate = async () => {
  const client = await pool.connect();

  try {
    console.log('🚀 Starting database migration...\n');

    await createTables(client);
    await createIndexes(client);
    await createTriggers(client);

    console.log('\n✨ Migration completed successfully!');
    console.log('📚 Your database is now ready for TitanBot.\n');
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
};

migrate();
