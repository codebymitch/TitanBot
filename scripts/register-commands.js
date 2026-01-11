import { Client, GatewayIntentBits, Collection } from 'discord.js';
import { config } from 'dotenv';
import { loadCommands, registerCommands } from '../src/handlers/commandLoader.js';
import { logger } from '../src/utils/logger.js';

// Load environment variables
config();

// Initialize Discord client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});

// Handle errors
process.on('unhandledRejection', error => {
    logger.error('Unhandled promise rejection:', error);
});

// When client is ready
client.once('ready', async () => {
    try {
        logger.info(`Logged in as ${client.user.tag}`);
        
        // Load commands
        await loadCommands(client);
        
        // Register commands
        const guildId = process.env.DEV_GUILD_ID; // Optional: for testing
        await registerCommands(client, guildId);
        
        logger.info('Successfully registered all commands!');
        
    } catch (error) {
        logger.error('Error during command registration:', error);
        process.exit(1);
    } finally {
        client.destroy();
        process.exit(0);
    }
});

// Login to Discord
client.login(process.env.DISCORD_TOKEN).catch(error => {
    logger.error('Failed to login:', error);
    process.exit(1);
});
