import 'dotenv/config';
import { Client, Collection, GatewayIntentBits } from 'discord.js';
import { REST } from '@discordjs/rest';
import express from 'express';
import { rateLimit } from 'express-rate-limit';
import cron from 'node-cron';

import config from './config/application.js';
import { initializeDatabase } from './utils/database.js';
import { getGuildConfig } from './services/guildConfig.js';
import { getServerCounters, saveServerCounters, updateCounter } from './services/serverstatsService.js';
import { logger, startupLog, shutdownLog } from './utils/logger.js';
import { checkBirthdays } from './services/birthdayService.js';
import { checkGiveaways } from './services/giveawayService.js';
import { loadCommands, registerCommands as registerSlashCommands } from './handlers/commandLoader.js';
import { createPvpEventHandler } from './api/pvpEventRoute.js';
import { recordPvpKill } from './utils/database/pvp.js';
import { expirePendingFights } from './services/osrsStakingService.js';
import pkg from '../package.json' with { type: 'json' };
import { EXPECTED_SCHEMA_VERSION, EXPECTED_SCHEMA_LABEL } from './config/schemaVersion.js';

class TitanBot extends Client {
  constructor() {
    super({
      intents: [
        
        GatewayIntentBits.Guilds,                        
        GatewayIntentBits.GuildMembers,                 

        GatewayIntentBits.GuildMessages,                
        GatewayIntentBits.GuildMessageReactions,        
        GatewayIntentBits.MessageContent,               
        GatewayIntentBits.DirectMessages,

        GatewayIntentBits.GuildVoiceStates,             

        GatewayIntentBits.GuildBans,                    
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
      startupLog('Starting TitanBot...');
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      startupLog('Initializing database...');

      // Robust database initialization: handle multiple possible return shapes
      let dbWrapper = null;
      try {
        const result = await initializeDatabase();

        // Case A: initializeDatabase returned an object containing { db: wrapper }
        if (result && result.db && typeof result.getStatus !== 'function') {
          // result.db might be the wrapper instance or the underlying store; prefer wrapper if present
          dbWrapper = result.db;
        }

        // Case B: initializeDatabase returned the wrapper instance directly
        if (!dbWrapper && result && typeof result.getStatus === 'function') {
          dbWrapper = result;
        }

        // Case C: initializeDatabase returned something else (or undefined) — import singleton wrapper
        if (!dbWrapper) {
          const wrapperModule = await import('./utils/database/wrapper.js');
          const candidate = wrapperModule.db ?? wrapperModule.default ?? wrapperModule;
          if (candidate && typeof candidate.initializeDatabase === 'function' && !candidate.initialized) {
            await candidate.initializeDatabase();
          }
          dbWrapper = candidate;
        }
      } catch (err) {
        logger.warn('Database initialization failed, falling back to wrapper singleton:', err?.message || err);
        const wrapperModule = await import('./utils/database/wrapper.js');
        const candidate = wrapperModule.db ?? wrapperModule.default ?? wrapperModule;
        if (candidate && typeof candidate.initializeDatabase === 'function' && !candidate.initialized) {
          try { await candidate.initializeDatabase(); } catch (e) { /* ignore */ }
        }
        dbWrapper = candidate;
      }

      // Ensure we always set this.db to the wrapper object (it must implement getStatus/get/set/get etc.)
      this.db = dbWrapper;

      // Defensive check for getStatus presence
      const dbStatus = (this.db && typeof this.db.getStatus === 'function')
        ? this.db.getStatus()
        : { isDegraded: true, connectionType: 'none', degradedReason: 'DB_NOT_INITIALIZED' };

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
        startupLog(`✅ Database Status: ${dbStatus.connectionType} (fully operational)`);
      }
      
      startupLog('Starting web server...');
      this.startWebServer();
      
      startupLog('Loading commands...');
      await loadCommands(this);
      startupLog(`Commands loaded: ${this.commands.size}`);
      
      startupLog('Loading handlers...');
      await this.loadHandlers();
      startupLog('Handlers loaded');
      
      startupLog('Logging into Discord...');
      await this.login(this.config.bot.token);
      startupLog('Discord login successful');
      
      startupLog('Registering slash commands...');
      await this.registerCommands();
      if (this.config.bot.multiGuild) {
        startupLog('Multi-guild mode enabled — slash commands registered globally');
      } else if (this.config.bot.guildId) {
        startupLog(`Single-guild mode — slash commands registered for guild ${this.config.bot.guildId}`);
      }
      startupLog('Slash commands registration complete');
      
      const databaseMode = dbStatus.isDegraded
        ? 'Optional in-memory mode (data resets after restart)'
        : 'Connected (persistent data enabled)';
      const handlerSummary = `${this.buttons.size} buttons, ${this.selectMenus.size} menus, ${this.modals.size} modals`;
      startupLog(
        `ONLINE ✅ | ${this.commands.size} commands loaded | ${handlerSummary} | Database: ${databaseMode}`
      );
      
      this.setupCronJobs();
    } catch (error) {
      logger.error('Failed to start bot:', error);
      process.exit(1);
    }
  }

  startWebServer() {
    const app = express();
    const configuredPort = Number(this.config.api?.port || process.env.PORT || 3000);
    const maxPortRetryAttempts = Number(process.env.PORT_RETRY_ATTEMPTS || 5);
    const host = process.env.WEB_HOST || '0.0.0.0';
    const corsOrigin = this.config.api?.cors?.origin || '*';
    const allowedHeaders = this.config.api?.cors?.allowedHeaders || ['Content-Type', 'Authorization'];
    
    // Trust proxy for Railway
    app.set('trust proxy', 1);
    
    app.use((req, res, next) => {
      const allowedOrigins = Array.isArray(corsOrigin) ? corsOrigin : [corsOrigin];
      const origin = req.headers.origin;
      
      if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
        res.header('Access-Control-Allow-Origin', origin || '*');
      }
      res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.header('Access-Control-Allow-Headers', allowedHeaders.join(', '));
      
      if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
      }
      next();
    });

    // Parse JSON for most endpoints
    app.use(express.json({ limit: '16kb' }));
    
    // Parse URL-encoded form data
    app.use(express.urlencoded({ limit: '16kb', extended: true }));

    const requestCounts = new Map();
    const windowMs = 60000; 
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

    // Middleware to parse multipart/form-data manually for PvP endpoint (with large limit)
    app.post('/api/pvp-event', express.raw({ type: 'multipart/form-data', limit: '500mb' }), (req, res, next) => {
      const contentType = req.headers['content-type'];
      
      // If it's multipart/form-data, parse it manually
      if (contentType && contentType.includes('multipart/form-data')) {
        const boundary = contentType.split('boundary=')[1];
        if (boundary && req.body) {
          const bodyStr = req.body.toString('utf-8');
          const parts = bodyStr.split(`--${boundary}`);
          const fields = {};
          
          for (const part of parts) {
            if (part.includes('Content-Disposition')) {
              const nameMatch = part.match(/name="([^"]+)"/);
              const valueMatch = part.match(/\r\n\r\n([\s\S]*?)\r\n/);
              
              if (nameMatch && valueMatch) {
                const name = nameMatch[1];
                const value = valueMatch[1];
                fields[name] = value;
              }
            }
          }
          
          req.body = fields;
          logger.warn(`[PVP] Parsed multipart form data: ${JSON.stringify(fields)}`);
        }
      }
      
      next();
    });

    // Debug logging middleware for PvP endpoint
    app.use('/api/pvp-event', (req, res, next) => {
      logger.warn(`[PVP] Received incoming request to /api/pvp-event`);
      logger.warn(`[PVP] Method: ${req.method}`);
      logger.warn(`[PVP] Content-Type: ${req.headers['content-type']}`);
      logger.warn(`[PVP] Body: ${JSON.stringify(req.body)}`);
      logger.warn(`[PVP] Raw body size: ${req.get('content-length')} bytes`);
      next();
    });

    app.post(
      '/api/pvp-event',
      rateLimit({
        windowMs: this.config.api?.pvpEvent?.rateLimit?.windowMs || 60_000,
        limit: this.config.api?.pvpEvent?.rateLimit?.max || 30,
        standardHeaders: true,
        legacyHeaders: false,
        handler: (req, res, _next, options) => {
          logger.warn('[PVP] PvP webhook rate limit exceeded', {
            event: 'api.pvp_event.rate_limited',
            ip: req.ip ?? 'unknown',
          });
          return res.status(options.statusCode).json({ error: 'Too many requests' });
        },
      }),
      createPvpEventHandler({
        recordKill: recordPvpKill,
        logger,
        token: this.config.api?.pvpEvent?.token,
        defaultGuildId: this.config.api?.pvpEvent?.defaultGuildId,
      }),
    );

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
      const dbStatus = this.db?.getStatus?.() || { isDegraded: true, connectionType: 'none' };
      const isReady = this.isReady() && !dbStatus.isDegraded;

      const metrics = {
        guildCount: this.guilds?.cache?.size ?? 0,
        commandCount: this.commands?.size ?? 0,
        database: {
          mode: dbStatus.connectionType,
          degraded: dbStatus.isDegraded,
          degradedReason: dbStatus.degradedReason ?? null,
        },
        schemaVersion: EXPECTED_SCHEMA_VERSION,
        schemaLabel: EXPECTED_SCHEMA_LABEL,
      };

      if (isReady) {
        return res.status(200).json({
          ready: true,
          message: 'Bot is ready',
          metrics,
        });
      }

      res.status(503).json({
        ready: false,
        reason: !this.isReady() ? 'Bot not Ready' : 'Database degraded',
        metrics,
      });
    });

    app.get('/', (req, res) => {
      res.status(200).json({ 
        message: 'TitanBot System Online',
        version: pkg.version,
        timestamp: new Date().toISOString()
      });
    });

    const startServer = (port, attempt = 0) => {
      let hasStartedListening = false;
      const server = app.listen(port, host, () => {
        hasStartedListening = true;
        this.webServer = server;
        startupLog(`✅ Web Server running on ${host}:${port}`);
        startupLog(`Health endpoint: http://${host}:${port}/health`);
        startupLog(`Ready endpoint: http://${host}:${port}/ready`);
      });

      server.on('error', (error) => {
        const errorCode = error?.code || 'UNKNOWN_ERROR';
        const errorMessage = error?.message || 'Unknown server error';

        if (!hasStartedListening && errorCode === 'EADDRINUSE' && attempt < maxPortRetryAttempts) {
          const nextPort = port + 1;
          startupLog(`Port ${port} is already in use. Trying port ${nextPort}...`);
          setTimeout(() => startServer(nextPort, attempt + 1), 250);
          return;
        }

        if (hasStartedListening && errorCode === 'EADDRINUSE') {
          logger.warn(`Web server reported a duplicate bind warning on ${host}:${port}, but the bot remains online.`);
          return;
        }

        logger.error(`❌ Web server error on port ${port} (${errorCode}): ${errorMessage}`);

        if (!hasStartedListening) {
          process.exit(1);
        }
      });
    };

    startServer(configuredPort, 0);
  }

  setupCronJobs() {
    cron.schedule('0 6 * * *', () => checkBirthdays(this));
    cron.schedule('* * * * *', () => checkGiveaways(this));
    cron.schedule('*/15 * * * *', () => this.updateAllCounters());
    cron.schedule('* * * * *', () => expirePendingFights(this).catch((error) => {
      logger.error('[OSRS_FIGHT] Failed to expire fights:', error);
    }));
  }

  async updateAllCounters() {
    if (!this.db) {
      logger.warn('Database not available for counter updates');
      return;
    }
    
    for (const [guildId, guild] of this.guilds.cache) {
      try {
        const counters = await getServerCounters(this, guildId);
        const validCounters = [];
        const orphanedCounters = [];
        
        for (const counter of counters) {
          if (counter && counter.type && counter.channelId && counter.enabled !== false) {
            const channel = guild.channels.cache.get(counter.channelId);
            if (channel) {
              validCounters.push(counter);
              await updateCounter(this, guild, counter);
            } else {
              orphanedCounters.push(counter);
              logger.info(`Removing orphaned counter ${counter.id} (type: ${counter.type}, deleted channel: ${counter.channelId}) from guild ${guildId}`);
            }
          }
        }
        
        // Save cleaned counters if any were orphaned
        // Save cleaned counters if any were orphaned
        if (orphanedCounters.length > 0) {
          await saveServerCounters(this, guildId, validCounters);
          logger.info(`Cleaned up ${orphanedCounters.length} orphaned counter(s) from guild ${guildId} during scheduled update`);
        }
      } catch (error) {
        logger.error(`Error updating counters for guild ${guildId}:`, error);
      }
    }
  }

  async loadHandlers() {
    startupLog('Loading handlers...');
    const handlers = [
      { path: 'events', type: 'default', required: true },
      { path: 'interactions', type: 'default', required: true }
    ];

    for (const handler of handlers) {
      try {
        startupLog(`Loading handler: ${handler.path}`);
        const module = await import(`./handlers/${handler.path}.js`);
        const loaderFn = handler.type.startsWith('named:')
          ? module[handler.type.split(':')[1]]
          : module.default;

        if (typeof loaderFn === 'function') {
          await loaderFn(this);
          startupLog(`✅ Loaded ${handler.path}`);
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
      const { clientId, guildId, multiGuild } = this.config.bot;
      await registerSlashCommands(this, { clientId, guildId, multiGuild });
    } catch (error) {
      logger.error('Error registering commands:', error);
    }
  }

  async shutdown(reason = 'UNKNOWN') {
    shutdownLog(`Bot is shutting down (${reason})...`);
    logger.info(`\n${'='.repeat(60)}`);
    logger.info(`🛑 Graceful Shutdown Initiated (${reason})`);
    logger.info(`${'='.repeat(60)}`);

    try {
      
      logger.info('Stopping cron jobs...');
      cron.getTasks().forEach(task => task.stop());
      logger.info('✅ Cron jobs stopped');

      // Close database connection
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

      logger.info('Destroying Discord client...');
      if (this.isReady()) {
        try {
          this.destroy();
          logger.info('✅ Discord client destroyed');
        } catch (error) {

          logger.warn('Discord client destroy warning (non-critical):', error.message);
        }
      }

      logger.info('✅ Graceful shutdown complete');
      shutdownLog('Bot stopped successfully.');
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
      const code = reason?.code;
      if (code === 10062 || code === 40060 || code === 50027) {
        logger.warn('Recoverable Discord interaction rejection:', reason?.message || reason);
        return;
      }

      logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
      bot.shutdown('UNHANDLED_REJECTION');
    });
  };
  
  setupShutdown();
  bot.start().catch((error) => {
    logger.error('Fatal error during bot startup:', error);
    bot.shutdown('STARTUP_ERROR');
  });
} catch (error) {
  logger.error('Fatal error during bot startup:', error);
  process.exit(1);
}

export default TitanBot;
