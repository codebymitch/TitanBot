import { 
    Client, 
    Collection, 
    GatewayIntentBits, 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle, 
    StringSelectMenuBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    ChannelType 
} from 'discord.js';
import { REST, Routes } from 'discord.js';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs/promises';
import express from 'express';
import cron from 'node-cron';

// Polyfill for ReadableStream in older Node.js environments
import { ReadableStream } from 'web-streams-polyfill';
if (typeof global.ReadableStream === 'undefined') {
    global.ReadableStream = ReadableStream;
}

import config from './config/index.js';
import { initializeDatabase, getFromDb, setInDb, deleteFromDb } from './utils/database.js';
import { getGuildConfig } from './services/guildConfig.js';
import { getAFKKey } from './utils/afk.js';
import { giveawayKey, getGuildGiveaways } from './utils/giveaways.js';
import { handleReactionRoles } from './handlers/reactionRoles.js';
import { createEmbed, errorEmbed, successEmbed } from './utils/embeds.js';
import { getLevelingConfig, getUserLevelData, saveUserLevelData, getXpForLevel } from './utils/database.js';
import { addXp } from './services/xpSystem.js';
import { getServerCounters, saveServerCounters, updateCounter } from './services/counterService.js';
import { logger } from './utils/logger.js';
import { checkBirthdays } from './services/birthdayService.js';
import { checkGiveaways } from './services/giveawayService.js';
import { loadCommands, registerCommands as registerSlashCommands } from './handlers/commandLoader.js';

class TitanBot extends Client {
  constructor() {
    super({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessageTyping,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.DirectMessageReactions,
        GatewayIntentBits.DirectMessageTyping,
        GatewayIntentBits.GuildInvites,
        GatewayIntentBits.GuildWebhooks,
        GatewayIntentBits.GuildIntegrations,
        GatewayIntentBits.GuildEmojisAndStickers,
        GatewayIntentBits.GuildScheduledEvents,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildMessagePolls,
        GatewayIntentBits.DirectMessagePolls,
        GatewayIntentBits.AutoModerationConfiguration,
        GatewayIntentBits.AutoModerationExecution,
        GatewayIntentBits.GuildModeration
      ],
    });

    this.config = config;
    this.commands = new Collection();
    this.events = new Collection();
    this.buttons = new Collection();
    this.selectMenus = new Collection();
    this.modals = new Collection();
    this.cooldowns = new Collection();
    this.db = null;
    this.rest = new REST({ version: '10' }).setToken(config.bot.token);
  }

  async start() {
    try {
      // Initialize database
      const dbInstance = await initializeDatabase();
      this.db = dbInstance.db;
      
      // Start the web server for keep-alive
      this.startWebServer();
      
      // Load commands using the new loader
      await loadCommands(this);
      
      // Load other handlers
      await this.loadHandlers();
      
      // Login to Discord first
      await this.login(this.config.bot.token);
      
      // Register commands after login
      await this.registerCommands();
      
      // Start cron jobs
      this.setupCronJobs();
      
      logger.info('Bot is running!');
    } catch (error) {
      logger.error('Failed to start bot:', error);
      process.exit(1);
    }
  }

  startWebServer() {
    const app = express();
    app.get("/", (req, res) => res.send("TitanBot System Online"));
    app.listen(3000, () => console.log(" Web Server is ready."));
  }

  setupCronJobs() {
    // Daily birthday check at 6 AM UTC
    cron.schedule('0 6 * * *', () => checkBirthdays(this));
    
    // Check giveaways every minute
    cron.schedule('* * * * *', () => checkGiveaways(this));
    
    // Update counters every 15 minutes
    cron.schedule('*/15 * * * *', () => this.updateAllCounters());
  }

  async updateAllCounters() {
    for (const [guildId, guild] of this.guilds.cache) {
      try {
        const counters = await getServerCounters(this, guildId);
        for (const [counterName, counter] of Object.entries(counters)) {
          if (counter && counter.enabled) {
            await updateCounter(this, guild, counter);
          }
        }
      } catch (error) {
        console.error(`Error updating counters for guild ${guildId}:`, error);
      }
    }
  }

  async loadHandlers() {
    const handlers = ['events', 'interactions']; // Removed 'commands' since we're using the new handler
    
    for (const handler of handlers) {
      try {
        const { default: loadHandler } = await import(`./handlers/${handler}.js`);
        await loadHandler(this);
        logger.info(`Loaded ${handler} handler`);
      } catch (error) {
        // Ignore missing handlers that might not exist
        if (error.code !== 'MODULE_NOT_FOUND') {
          logger.error(`Error loading ${handler} handler:`, error);
        }
      }
    }
    
    // Load todo button handlers
    try {
      const { default: loadTodoButtons } = await import('./handlers/todoButtonLoader.js');
      await loadTodoButtons(this);
      logger.info('Loaded todo button handlers');
    } catch (error) {
      logger.error('Error loading todo button handlers:', error);
    }
    
    // Load ticket button handlers
    try {
      const { default: loadTicketButtons } = await import('./handlers/ticketButtonLoader.js');
      await loadTicketButtons(this);
      logger.info('Loaded ticket button handlers');
    } catch (error) {
      logger.error('Error loading ticket button handlers:', error);
    }
    
    // Load giveaway button handlers
    try {
      const { loadGiveawayButtons } = await import('./handlers/giveawayButtonLoader.js');
      loadGiveawayButtons(this);
      logger.info('Loaded giveaway button handlers');
    } catch (error) {
      logger.error('Error loading giveaway button handlers:', error);
    }
  }

  async registerCommands() {
    try {
      await registerSlashCommands(this, this.config.bot.guildId);
    } catch (error) {
      logger.error('Error registering commands:', error);
    }
  }
}

// Start the bot when this file is run directly
const bot = new TitanBot();
bot.start();

export default TitanBot;