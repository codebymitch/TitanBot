import 'dotenv/config';
import { Client, Collection, GatewayIntentBits } from 'discord.js';
import { REST } from '@discordjs/rest';
import express from 'express';
import cron from 'node-cron';

import { ReadableStream } from 'web-streams-polyfill';
if (typeof global.ReadableStream === 'undefined') {
    global.ReadableStream = ReadableStream;
}

import config from './config/application.js';
import { initializeDatabase } from './utils/database.js';
import { getGuildConfig } from './services/guildConfig.js';
import { getServerCounters, updateCounter } from './services/counterService.js';
import { logger } from './utils/logger.js';
import { checkBirthdays } from './services/birthdayService.js';
import { checkGiveaways } from './services/giveawayService.js';
import { loadCommands, registerCommands as registerSlashCommands } from './handlers/commandLoader.js';

class TitanBot extends Client {
  constructor() {
    super({
      intents: [
        // Core functionality
        GatewayIntentBits.Guilds,                        // Basic guild events (required)
        GatewayIntentBits.GuildMembers,                 // Member join/leave (welcome system)
        
        // Message handling
        GatewayIntentBits.GuildMessages,                // Message create (leveling, commands)
        GatewayIntentBits.GuildMessageReactions,        // Reaction tracking for giveaways
        
        // Voice
        GatewayIntentBits.GuildVoiceStates,             // Voice channel tracking
        
        // Moderation & Logging
        GatewayIntentBits.GuildBans,                    // Moderation (ban/unban)
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
        logger.warn('╔═══════════════════════════════════════════════════════╗');
        logger.warn('║ ⚠️  DATABASE RUNNING IN DEGRADED MODE                 ║');
        logger.warn('║                                                       ║');
        logger.warn('║ Connection: In-Memory Storage (PostgreSQL unavailable)║');
        logger.warn('║ Data Persistence: DISABLED - data lost on restart    ║');
        logger.warn('║ Action Required: Fix PostgreSQL and restart bot      ║');
        logger.warn('╚═══════════════════════════════════════════════════════╝');
        logger.warn('');
      } else {
        logger.info(`✅ Database Status: ${dbStatus.connectionType} (fully operational)`);
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
    let serverStarted = false;
    
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

    app.get('/', (req, res) => {
      res.status(200).json({ 
        message: 'TitanBot System Online',
        version: '2.0.0',
        timestamp: new Date().toISOString()
      });
    });

    const server = app.listen(port, () => {
      serverStarted = true;
      logger.info(`✅ Web Server running on port ${port}`);
      logger.info(`   Health: http://localhost:${port}/health`);
      logger.info(`   Ready: http://localhost:${port}/ready`);
    });

    server.on('error', (error) => {
      logger.error(`❌ Failed to start web server on port ${port}:`, error.message);
      if (!serverStarted) {
        process.exit(1);
      }
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
        for (const counter of counters) {
          if (counter && counter.type && counter.channelId && counter.enabled !== false) {
            await updateCounter(this, guild, counter);
          }
        }
      } catch (error) {
        logger.error(`Error updating counters for guild ${guildId}:`, error);
      }
    }
  }

  async loadHandlers() {
    const handlers = [
      { path: 'events', type: 'default', required: true },
      { path: 'interactions', type: 'default', required: true },
      { path: 'todoButtonLoader', type: 'default', required: false },
      { path: 'ticketButtonLoader', type: 'default', required: false },
      { path: 'shopButtonLoader', type: 'default', required: false },
      { path: 'giveawayButtonLoader', type: 'named:loadGiveawayButtons', required: false },
      { path: 'helpButtonLoader', type: 'default', required: false },
      { path: 'helpSelectMenuLoader', type: 'default', required: false },
      { path: 'loggingButtonLoader', type: 'default', required: false },
      { path: 'verificationButtonLoader', type: 'named:loadVerificationButtons', required: false },
      { path: 'wipedataButtonLoader', type: 'default', required: false }
    ];

    for (const handler of handlers) {
      try {
        const module = await import(`./handlers/${handler.path}.js`);
        const loaderFn = handler.type.startsWith('named:') 
          ? module[handler.type.split(':')[1]] 
          : module.default;
        
        if (typeof loaderFn === 'function') {
          await loaderFn(this);
          logger.info(`✅ Loaded ${handler.path}`);
        } else {
          throw new Error(`Invalid loader export from ${handler.path}`);
        }
      } catch (error) {
        if (handler.required) {
          logger.error(`❌ Failed to load required handler ${handler.path}:`, error.message);
          throw error;
        } else if (error.code !== 'MODULE_NOT_FOUND') {
          logger.warn(`⚠️  Failed to load optional handler ${handler.path}:`, error.message);
        }
      }
    }
  }

  async registerCommands() {
    try {
      await registerSlashCommands(this, this.config.bot.guildId);
    } catch (error) {
      logger.error('Error registering commands:', error);
    }
  }

  async shutdown(reason = 'UNKNOWN') {
    logger.info(`\n${'='.repeat(60)}`);
    logger.info(`🛑 Graceful Shutdown Initiated (${reason})`);
    logger.info(`${'='.repeat(60)}`);

    try {
      // Stop all cron jobs
      logger.info('Stopping cron jobs...');
      cron.getTasks().forEach(task => task.stop());
      logger.info('✅ Cron jobs stopped');

      // Close database connection
      if (this.db && this.db.db) {
        logger.info('Closing database connection...');
        try {
          if (this.db.db.pool) {
            await this.db.db.pool.end();
            logger.info('✅ Database connection closed');
          }
        } catch (error) {
          logger.warn('Error closing database pool:', error.message);
        }
      }

      // Destroy Discord client
      logger.info('Destroying Discord client...');
      if (this.isReady()) {
        try {
          this.destroy();
          logger.info('✅ Discord client destroyed');
        } catch (error) {
          // Discord.js version compatibility issue with clearHashSweeper
          // The client is being destroyed anyway during shutdown
          logger.warn('Discord client destroy warning (non-critical):', error.message);
        }
      }

      logger.info('✅ Graceful shutdown complete');
      process.exit(0);
    } catch (error) {
      logger.error('Error during graceful shutdown:', error);
      process.exit(1);
    }
  }
}

try {
  const bot = new TitanBot();
  
  const setupShutdown = () => {
    process.on('SIGTERM', () => bot.shutdown('SIGTERM'));
    process.on('SIGINT', () => bot.shutdown('SIGINT'));
    
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception:', error);
      bot.shutdown('UNCAUGHT_EXCEPTION');
    });
    
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



