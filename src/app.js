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
import config from './config/index.js';
import { initializeDatabase, getFromDb, setInDb, deleteFromDb } from './services/database.js';
import { getGuildConfig } from './services/guildConfig.js';
import { getAFKKey } from './utils/afk.js';
import { giveawayKey, getGuildGiveaways } from './utils/giveaways.js';
import { handleReactionRoles } from './handlers/reactionRoles.js';
import { createEmbed, errorEmbed, successEmbed } from './utils/embeds.js';
import { getLevelingConfig, getUserLevelData, saveUserLevelData, getXpForLevel, addXp } from './services/leveling.js';
import { getServerCounters, saveServerCounters, updateCounter } from './services/counterService.js';
import { handleCountdownInteraction } from './commands/Tools/countdown.js';
import { logger } from './utils/logger.js';
import { checkBirthdays } from './services/birthdayService.js';
import { checkGiveaways } from './services/giveawayService.js';
import commandHandler from './handlers/commands.js';

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
      this.db = await initializeDatabase(this);
      
      // Start the web server for keep-alive
      this.startWebServer();
      
      // Load command handler
      await commandHandler(this);
      
      // Load other handlers
      await this.loadHandlers();
      
      // Register commands
      await this.registerCommands();
      
      // Start cron jobs
      this.setupCronJobs();
      
      // Login to Discord
      await this.login(this.config.bot.token);
      
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
    console.log(" Running scheduled counter update...");
    for (const [guildId, guild] of this.guilds.cache) {
      try {
        const counters = await getServerCounters(this, guildId);
        for (const [counterName, counter] of Object.entries(counters)) {
          if (counter.enabled) {
            await updateCounter(this, guild, counterName);
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
  }

  async registerCommands() {
    try {
      if (!this.config.bot.clientId) {
        logger.error('CLIENT_ID is required for command registration. Please set the CLIENT_ID environment variable.');
        return;
      }

      const commands = [];
      
      // Get all command data from the commands collection
      for (const [_, command] of this.commands) {
        if (command.data) {
          commands.push(command.data.toJSON());
        }
      }

      if (this.config.bot.guildId) {
        await this.rest.put(
          Routes.applicationGuildCommands(this.config.bot.clientId, this.config.bot.guildId),
          { body: commands }
        );
        logger.info(`Registered ${commands.length} guild commands`);
      } else {
        await this.rest.put(
          Routes.applicationCommands(this.config.bot.clientId),
          { body: commands }
        );
        logger.info(`Registered ${commands.length} global commands`);
      }
    } catch (error) {
      logger.error('Error registering commands:', error);
    }
  }
}

// Start the bot when this file is run directly
const bot = new TitanBot();
bot.start();

export default TitanBot;