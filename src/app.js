import 'dotenv/config';
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

import { ReadableStream } from 'web-streams-polyfill';
if (typeof global.ReadableStream === 'undefined') {
    global.ReadableStream = ReadableStream;
}

import config from './config/index.js';
import { initializeDatabase } from './utils/database.js';
import { getFromDb, setInDb, deleteFromDb } from './utils/database.js';
import { getGuildConfig } from './services/guildConfig.js';
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
        // Core functionality
        GatewayIntentBits.Guilds,                    // Basic guild events (required)
        GatewayIntentBits.GuildMembers,              // Member join/leave (welcome system)
        
        // Message handling
        GatewayIntentBits.GuildMessages,             // Message create (leveling, commands)
        GatewayIntentBits.MessageContent,            // Required to read message content for leveling
        GatewayIntentBits.GuildMessageReactions,     // Reaction tracking for giveaways
        
        // Voice
        GatewayIntentBits.GuildVoiceStates,          // Voice channel tracking
        
        // Moderation & Logging
        GatewayIntentBits.GuildModeration,           // Moderation audit logging
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
      logger.info('Starting TitanBot...');
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      logger.info('Initializing database...');
      const dbInstance = await initializeDatabase();
      this.db = dbInstance.db;
      
      // Check database status and report
      const dbStatus = this.db.getStatus();
      if (dbStatus.isDegraded) {
        logger.warn('');
        logger.warn('â•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—');
        logger.warn('â•‘ âš ï¸  DATABASE RUNNING IN DEGRADED MODE                 â•‘');
        logger.warn('â•‘                                                       â•‘');
        logger.warn('â•‘ Connection: In-Memory Storage (PostgreSQL unavailable)â•‘');
        logger.warn('â•‘ Data Persistence: DISABLED - data lost on restart    â•‘');
        logger.warn('â•‘ Action Required: Fix PostgreSQL and restart bot      â•‘');
        logger.warn('â•šâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•');
        logger.warn('');
      } else {
        logger.info(`âœ… Database Status: ${dbStatus.connectionType} (fully operational)`);
      }
      
      logger.info('Starting web server...');
      this.startWebServer();
      
      logger.info('Starting to load commands...');
      await loadCommands(this);
      logger.info(`Command loading completed. Total commands loaded: ${this.commands.size}`);
      
      logger.info('Loading handlers...');
      await this.loadHandlers();
      logger.info('Handlers loaded');
      
      logger.info('Logging into Discord...');
      await this.login(this.config.bot.token);
      logger.info('Discord login successful');
      
      logger.info('Registering commands...');
      await this.registerCommands();
      logger.info('Commands registered');
      
      logger.info('Bot is running!');
      
      this.setupCronJobs();
    } catch (error) {
      logger.error('Failed to start bot:', error);
      process.exit(1);
    }
  }

  startWebServer() {
    const app = express();
    const port = this.config.api?.port || process.env.PORT || 3000;
    const corsOrigin = this.config.api?.cors?.origin || '*';
    
    // CORS middleware
    app.use((req, res, next) => {
      const allowedOrigins = Array.isArray(corsOrigin) ? corsOrigin : [corsOrigin];
      const origin = req.headers.origin;
      
      if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
        res.header('Access-Control-Allow-Origin', origin || '*');
      }
      res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      
      if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
      }
      next();
    });

    // Simple rate limiting middleware (requests per minute per IP)
    const requestCounts = new Map();
    const windowMs = 60000; // 1 minute
    const maxRequests = this.config.api?.rateLimit?.max || 100;
    
    app.use((req, res, next) => {
      const ip = req.ip;
      const now = Date.now();
      const windowStart = now - windowMs;
      
      if (!requestCounts.has(ip)) {
        requestCounts.set(ip, []);
      }
      
      const times = requestCounts.get(ip).filter(t => t > windowStart);
      
      if (times.length >= maxRequests) {
        return res.status(429).json({ error: 'Too many requests' });
      }
      
      times.push(now);
      requestCounts.set(ip, times);
      next();
    });

    // Health check endpoint
    app.get('/health', (req, res) => {
      const dbStatus = this.db?.getStatus?.() || { isDegraded: 'unknown' };
      const status = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        database: {
          connected: dbStatus.connectionType !== 'none',
          degraded: dbStatus.isDegraded,
          type: dbStatus.connectionType
        }
      };
      res.status(200).json(status);
    });

    // Readiness check endpoint (only healthy if DB is available)
    app.get('/ready', (req, res) => {
      const dbStatus = this.db?.getStatus?.() || { isDegraded: true };
      const isReady = this.ready && !dbStatus.isDegraded;
      
      if (isReady) {
        return res.status(200).json({ 
          ready: true, 
          message: 'Bot is ready' 
        });
      }
      
      res.status(503).json({ 
        ready: false,
        reason: !this.ready ? 'Bot not Ready' : 'Database degraded' 
      });
    });

    // Default endpoint
    app.get('/', (req, res) => {
      res.status(200).json({ 
        message: 'TitanBot System Online',
        version: '2.0.0',
        timestamp: new Date().toISOString()
      });
    });

    app.listen(port, () => {
      logger.info(`âœ… Web Server running on port ${port}`);
      logger.info(`   Health: http://localhost:${port}/health`);
      logger.info(`   Ready: http://localhost:${port}/ready`);
    });
  }

  setupCronJobs() {
    cron.schedule('0 6 * * *', () => checkBirthdays(this));
    cron.schedule('* * * * *', () => checkGiveaways(this));
    cron.schedule('*/15 * * * *', () => this.updateAllCounters());
  }

  async updateAllCounters() {
    if (!this.db) {
      logger.warn('Database not available for counter updates');
      return;
    }
    
    for (const [guildId, guild] of this.guilds.cache) {
      try {
        const counters = await getServerCounters(this, guildId);
        for (const [counterName, counter] of Object.entries(counters)) {
          if (counter && counter.enabled) {
            await updateCounter(this, guild, counter);
          }
        }
      } catch (error) {
        logger.error(`Error updating counters for guild ${guildId}:`, error);
      }
    }
  }

  async loadHandlers() {
const handlers = ['events', 'interactions'];
    
    for (const handler of handlers) {
      try {
        const { default: loadHandler } = await import(`./handlers/${handler}.js`);
        await loadHandler(this);
        logger.info(`Loaded ${handler} handler`);
      } catch (error) {
        if (error.code !== 'MODULE_NOT_FOUND') {
          logger.error(`Error loading ${handler} handler:`, error);
        }
      }
    }
    
    try {
      const { default: loadTodoButtons } = await import('./handlers/todoButtonLoader.js');
      await loadTodoButtons(this);
      logger.info('Loaded todo button handlers');
    } catch (error) {
      logger.error('Error loading todo button handlers:', error);
    }
    
    try {
      const { default: loadTicketButtons } = await import('./handlers/ticketButtonLoader.js');
      await loadTicketButtons(this);
      logger.info('Loaded ticket button handlers');
    } catch (error) {
      logger.error('Error loading ticket button handlers:', error);
    }
    
    try {
      const { default: loadShopButtons } = await import('./handlers/shopButtonLoader.js');
      await loadShopButtons(this);
      logger.info('Loaded shop button handlers');
    } catch (error) {
      logger.error('Error loading shop button handlers:', error);
    }
    
    try {
      const { loadGiveawayButtons } = await import('./handlers/giveawayButtonLoader.js');
      loadGiveawayButtons(this);
      logger.info('Loaded giveaway button handlers');
    } catch (error) {
      logger.error('Error loading giveaway button handlers:', error);
    }

    try {
      const { default: loadHelpButtons } = await import('./handlers/helpButtonLoader.js');
      loadHelpButtons(this);
      logger.info('Loaded help button handlers');
    } catch (error) {
      logger.error('Error loading help button handlers:', error);
    }

    try {
      const { default: loadHelpSelectMenus } = await import('./handlers/helpSelectMenuLoader.js');
      loadHelpSelectMenus(this);
      logger.info('Loaded help select menu handlers');
    } catch (error) {
      logger.error('Error loading help select menu handlers:', error);
    }
    
    try {
      const { loadVerificationButtons } = await import('./handlers/verificationButtonLoader.js');
      await loadVerificationButtons(this);
      logger.info('Loaded verification button handlers');
    } catch (error) {
      logger.error('Error loading verification button handlers:', error);
    }
    
    try {
      const { default: loadWipedataButtons } = await import('./handlers/wipedataButtonLoader.js');
      await loadWipedataButtons(this);
      logger.info('Loaded wipedata button handlers');
    } catch (error) {
      logger.error('Error loading wipedata button handlers:', error);
    }
  }

  async registerCommands() {
    try {
      await registerSlashCommands(this, this.config.bot.guildId);
    } catch (error) {
      logger.error('Error registering commands:', error);
    }
  }

  /**
   * Gracefully shutdown the bot
   * Stops cron jobs, closes database connection, and destroys Discord client
   */
  async shutdown(reason = 'UNKNOWN') {
    logger.info(`\n${'='.repeat(60)}`);
    logger.info(`ðŸ›‘ Graceful Shutdown Initiated (${reason})`);
    logger.info(`${'='.repeat(60)}`);

    try {
      // Stop all cron jobs
      logger.info('Stopping cron jobs...');
      cron.getTasks().forEach(task => task.stop());
      logger.info('âœ… Cron jobs stopped');

      // Close database connection
      if (this.db && this.db.db) {
        logger.info('Closing database connection...');
        try {
          if (this.db.db.pool) {
            await this.db.db.pool.end();
            logger.info('âœ… Database connection closed');
          }
        } catch (error) {
          logger.warn('Error closing database pool:', error.message);
        }
      }

      // Destroy Discord client
      logger.info('Destroying Discord client...');
      if (this.isReady()) {
        await this.destroy();
        logger.info('âœ… Discord client destroyed');
      }

      logger.info('âœ… Graceful shutdown complete');
      process.exit(0);
    } catch (error) {
      logger.error('Error during graceful shutdown:', error);
      process.exit(1);
    }
  }
}

try {
  const bot = new TitanBot();
  
  // Setup graceful shutdown handlers
  const setupShutdown = () => {
    process.on('SIGTERM', () => bot.shutdown('SIGTERM'));
    process.on('SIGINT', () => bot.shutdown('SIGINT'));
    
    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception:', error);
      bot.shutdown('UNCAUGHT_EXCEPTION');
    });
    
    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
      bot.shutdown('UNHANDLED_REJECTION');
    });
  };
  
  setupShutdown();
  bot.start();
} catch (error) {
  logger.error('Fatal error during bot startup:', error);
  process.exit(1);
}

export default TitanBot;
