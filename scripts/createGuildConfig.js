import { Client } from 'pg';

const client = new Client({
  connectionString: process.env.POSTGRES_URL
});

async function run() {
  await client.connect();

  await client.query(`
    CREATE TABLE IF NOT EXISTS guild_config (
      guild_id TEXT PRIMARY KEY,
      welcome_enabled BOOLEAN DEFAULT false,
      log_channel TEXT DEFAULT NULL
    );
  `);

  console.log('✅ Tabla guild_config creada');
  await client.end();
}

run();