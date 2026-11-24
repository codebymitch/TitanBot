import { Client, Collection, GatewayIntentBits } from 'discord.js';
import { assertRequiredEnv } from '../config/env.js';
import { connectDatabase, disconnectDatabase } from '../database/connect.js';
import { loadEvents } from './loadEvents.js';

let shuttingDown = false;

export async function startBot() {
  const env = assertRequiredEnv();
  let client;
  try {
    await connectDatabase(env.mongoUri);
    console.log('Connected to MongoDB.');

    client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
      ],
    });
    client.commands = new Collection();

    await loadEvents(client);
    client.on('error', (error) => console.error('Discord client error:', error?.message || error));
    await client.login(env.discordToken);
  } catch (error) {
    client?.destroy();
    await disconnectDatabase().catch(() => null);
    throw error;
  }

  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`Received ${signal}; shutting down.`);
    client.destroy();
    await disconnectDatabase().catch((error) => {
      console.error('MongoDB disconnect error:', error?.message || error);
    });
    process.exit(0);
  };

  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
  return client;
}
