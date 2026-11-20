
import 'dotenv/config';
import { Client, Collection } from 'discord.js';
import { REST } from '@discordjs/rest';
import { GatewayIntentBits } from 'discord.js';
import express from 'express';
import cron from 'node-cron';

import config from './config/application.js';
import { initializeDatabase } from './utils/database.js';
import {
  getServerCounters,
  saveServerCounters,
  updateCounter
} from './services/serverstatsService.js';

import { logger, startupLog, shutdownLog } from './utils/logger.js';
import { checkBirthdays } from './services/birthdayService.js';
import { checkGiveaways } from './services/giveawayService.js';

import {
  loadCommands,
  registerCommands as registerSlashCommands
} from './handlers/loaders/commandLoader.js';

import {
  runSafeTask,
  handleTaskError,
  ErrorCodes
} from './utils/errorHandler.js';

import { initializeMusic } from './services/music/riffySetup.js';
import { shutdownMusic } from './services/music/playerHandler.js';

import pkg from '../package.json' with { type: 'json' };

import {
  EXPECTED_SCHEMA_VERSION,
  EXPECTED_SCHEMA_LABEL
} from './config/database/schemaVersion.js';


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
    this.webServer = null;

    this.shuttingDown = false;

    this.rest = new REST({ version: '10' }).setToken(
      config.bot.token
    );
  }


  // ==========================================
  // START BOT
  // ==========================================

  async start() {
    try {
      startupLog('Starting TitanBot...');

      await new Promise(resolve => setTimeout(resolve, 1000));

      // DATABASE
      startupLog('Initializing database...');

      const dbInstance = await initializeDatabase();

      this.db = dbInstance.db;

      const dbStatus = this.db.getStatus();

      if (dbStatus.isDegraded) {
        logger.warn('');
        logger.warn('DATABASE RUNNING IN DEGRADED MODE');
        logger.warn('Connection: In-Memory Storage');
        logger.warn('Data Persistence: DISABLED');
        logger.warn('Data will be lost after restart');
        logger.warn('');
      } else {
        startupLog(
          `Database Status: ${dbStatus.connectionType} (operational)`
        );
      }


      // WEB SERVER
      startupLog('Starting web server...');

      this.startWebServer();


      // COMMANDS
      startupLog('Loading commands...');

      await loadCommands(this);

      startupLog(`Commands loaded: ${this.commands.size}`);


      // HANDLERS
      startupLog('Loading handlers...');

      await this.loadHandlers();

      startupLog('Handlers loaded');


      // MUSIC
      startupLog('Initializing music system...');

      initializeMusic(this);


      // DISCORD LOGIN
      startupLog('Logging into Discord...');

      await this.login(this.config.bot.token);

      startupLog('Discord login successful');


      // SLASH COMMANDS
      startupLog('Registering slash commands globally...');

      await this.registerCommands();

      startupLog('Slash commands registration complete');


      // SUMMARY
      const databaseMode = dbStatus.isDegraded
        ? 'In-memory mode (data resets after restart)'
        : 'PostgreSQL (persistent storage enabled)';

      const handlerSummary =
        `${this.buttons.size} buttons, ` +
        `${this.selectMenus.size} menus, ` +
        `${this.modals.size} modals`;

      startupLog(
        `ONLINE | ${this.commands.size} commands loaded | ` +
        `${handlerSummary} | Database: ${databaseMode}`
      );


      // CRON
      this.setupCronJobs();

    } catch (error) {
      logger.error('Failed to start bot:', error);

      // Let the main startup handler perform graceful shutdown.
      throw error;
    }
  }


  // ==========================================
  // WEB SERVER
  // ==========================================

  startWebServer() {
    const app = express();

    // Railway PORT takes priority.
    const configuredPort = Number(
      process.env.PORT ||
      this.config.api?.port ||
      3000
    );

    const isRailway = Boolean(
      process.env.RAILWAY_ENVIRONMENT ||
      process.env.RAILWAY_PROJECT_ID
    );

    // Do not switch ports on Railway.
    const maxPortRetryAttempts = isRailway
      ? 0
      : Number(process.env.PORT_RETRY_ATTEMPTS ?? 5);

    const host = process.env.WEB_HOST || '0.0.0.0';

    const corsOrigin =
      this.config.api?.cors?.origin || '*';


    // CORS
    app.use((req, res, next) => {
      const allowedOrigins = Array.isArray(corsOrigin)
        ? corsOrigin
        : [corsOrigin];

      const origin = req.headers.origin;

      if (
        allowedOrigins.includes('*') ||
        allowedOrigins.includes(origin)
      ) {
        res.header(
          'Access-Control-Allow-Origin',
          allowedOrigins.includes('*') ? '*' : origin
        );
      }

      res.header(
        'Access-Control-Allow-Methods',
        'GET, POST, OPTIONS'
      );

      res.header(
        'Access-Control-Allow-Headers',
        'Content-Type, Authorization'
      );

      if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
      }

      next();
    });


    // RATE LIMIT
    const requestCounts = new Map();

    const windowMs =
      this.config.api?.rateLimit?.windowMs || 60000;

    const maxRequests =
      this.config.api?.rateLimit?.max || 100;

    app.use((req, res, next) => {
      const ip = req.ip;

      const now = Date.now();
      const windowStart = now - windowMs;

      if (!requestCounts.has(ip)) {
        requestCounts.set(ip, []);
      }

      const times = requestCounts
        .get(ip)
        .filter(time => time > windowStart);

      if (times.length >= maxRequests) {
        return res.status(429).json({
          error: 'Too many requests'
        });
      }

      times.push(now);

      requestCounts.set(ip, times);

      next();
    });


    // ========================================
    // HEALTH CHECK
    // ========================================

    app.get('/health', (req, res) => {
      const dbStatus = this.db?.getStatus?.() || {
        isDegraded: true,
        isAvailable: false,
        connectionType: 'none'
      };

      const status = {
        status: 'healthy',

        timestamp: new Date().toISOString(),

        uptime: process.uptime(),

        database: {
          connected: dbStatus.isAvailable === true,
          degraded: dbStatus.isDegraded,
          type: dbStatus.connectionType
        }
      };

      return res.status(200).json(status);
    });


    // ========================================
    // READINESS CHECK
    // ========================================

    app.get('/ready', (req, res) => {
      const dbStatus = this.db?.getStatus?.() || {
        isDegraded: true,
        isAvailable: false,
        connectionType: 'none'
      };

      const discordReady = this.isReady();

      const databaseReady =
        dbStatus.isAvailable === true &&
        dbStatus.isDegraded === false;

      const isReady = discordReady && databaseReady;

      const metrics = {
        guildCount: this.guilds?.cache?.size ?? 0,

        commandCount: this.commands?.size ?? 0,

        database: {
          mode: dbStatus.connectionType,
          connected: dbStatus.isAvailable === true,
          degraded: dbStatus.isDegraded,
          degradedReason: dbStatus.degradedReason ?? null
        },

        schemaVersion: EXPECTED_SCHEMA_VERSION,

        schemaLabel: EXPECTED_SCHEMA_LABEL
      };


      if (isReady) {
        return res.status(200).json({
          ready: true,
          message: 'Bot is ready',
          metrics
        });
      }


      return res.status(503).json({
        ready: false,

        reason: !discordReady
          ? 'Bot not ready'
          : 'Database unavailable or degraded',

        metrics
      });
    });


    // ========================================
    // ROOT
    // ========================================

    app.get('/', (req, res) => {
      return res.status(200).json({
        message: 'TitanBot System Online',
        version: pkg.version,
        timestamp: new Date().toISOString()
      });
    });


    // ========================================
    // SERVER START
    // ========================================

    const startServer = (port, attempt = 0) => {
      let hasStartedListening = false;

      const server = app.listen(port, host, () => {
        hasStartedListening = true;

        this.webServer = server;

        startupLog(
          `Web Server running on ${host}:${port}`
        );

        startupLog(
          `Health endpoint: http://${host}:${port}/health`
        );

        startupLog(
          `Ready endpoint: http://${host}:${port}/ready`
        );
      });


      server.on('error', error => {
        const errorCode = error?.code || 'UNKNOWN_ERROR';

        const errorMessage =
          error?.message || 'Unknown server error';


        if (
          !hasStartedListening &&
          errorCode === 'EADDRINUSE' &&
          attempt < maxPortRetryAttempts
        ) {
          const nextPort = port + 1;

          startupLog(
            `Port ${port} is busy. Trying port ${nextPort}...`
          );

          setTimeout(() => {
            startServer(nextPort, attempt + 1);
          }, 250);

          return;
        }


        logger.error(
          `Web server error on port ${port} ` +
          `(${errorCode}): ${errorMessage}`
        );


        if (!hasStartedListening) {
          // A web server that failed to bind cannot serve health checks.
          process.exit(1);
        }
      });
    };


    startServer(configuredPort, 0);
  }


  // ==========================================
  // CRON JOBS
  // ==========================================

  setupCronJobs() {
    cron.schedule(
      '0 6 * * *',
      runSafeTask(
        'birthday_check',
        () => checkBirthdays(this)
      )
    );

    cron.schedule(
      '* * * * *',
      runSafeTask(
        'giveaway_check',
        () => checkGiveaways(this)
      )
    );

    cron.schedule(
      '*/15 * * * *',
      runSafeTask(
        'counter_update',
        () => this.updateAllCounters()
      )
    );

    startupLog('Cron jobs initialized');
  }


  // ==========================================
  // SERVER COUNTERS
  // ==========================================

  async updateAllCounters() {
    if (!this.db) {
      logger.warn(
        'Database not available for counter updates'
      );

      return;
    }

    for (const [guildId, guild] of this.guilds.cache) {
      try {
        const counters = await getServerCounters(
          this,
          guildId
        );

        const validCounters = [];
        const orphanedCounters = [];


        for (const counter of counters) {
          if (
            counter &&
            counter.type &&
            counter.channelId &&
            counter.enabled !== false
          ) {
            const channel = guild.channels.cache.get(
              counter.channelId
            );

            if (channel) {
              validCounters.push(counter);

              await updateCounter(
                this,
                guild,
                counter
              );

            } else {
              orphanedCounters.push(counter);

              logger.info(
                `Removing orphaned counter ${counter.id} ` +
                `(type: ${counter.type}, ` +
                `deleted channel: ${counter.channelId}) ` +
                `from guild ${guildId}`
              );
            }
          }
        }


        // Clean up counters that reference deleted channels.
        if (orphanedCounters.length > 0) {
          await saveServerCounters(
            this,
            guildId,
            validCounters
          );

          logger.info(
            `Cleaned up ${orphanedCounters.length} ` +
            `orphaned counter(s) from guild ${guildId}`
          );
        }

      } catch (error) {
        logger.error(
          `Error updating counters for guild ${guildId}:`,
          error
        );
      }
    }
  }


  // ==========================================
  // HANDLERS
  // ==========================================

  async loadHandlers() {
    startupLog('Loading handlers...');

    const handlers = [
      {
        path: 'events',
        type: 'default',
        required: true
      },
      {
        path: 'interactions',
        type: 'default',
        required: true
      }
    ];


    for (const handler of handlers) {
      try {
        startupLog(
          `Loading handler: ${handler.path}`
        );

        const module = await import(
          `./handlers/loaders/${handler.path}.js`
        );

        const loaderFn = handler.type.startsWith('named:')
          ? module[handler.type.split(':')[1]]
          : module.default;


        if (typeof loaderFn === 'function') {
          await loaderFn(this);

          startupLog(
            `Loaded ${handler.path}`
          );

        } else {
          throw new Error(
            `Invalid loader export from ${handler.path}`
          );
        }

      } catch (error) {
        if (handler.required) {
          logger.error(
            `Failed to load required handler ${handler.path}:`,
            error
          );

          throw error;

        } else if (error.code !== 'MODULE_NOT_FOUND') {
          logger.warn(
            `Failed to load optional handler ${handler.path}:`,
            error.message
          );
        }
      }
    }
  }


  // ==========================================
  // SLASH COMMAND REGISTRATION
  // ==========================================

  async registerCommands() {
    try {
      await registerSlashCommands(this, {
        clientId: this.config.bot.clientId
      });

    } catch (error) {
      logger.error(
        'Error registering commands:',
        error
      );

      // Keep startup behavior unchanged:
      // command registration errors are logged.
    }
  }


  // ==========================================
  // GRACEFUL SHUTDOWN
  // ==========================================

  async shutdown(reason = 'UNKNOWN', exitCode = 0) {
    if (this.shuttingDown) {
      logger.warn(
        'Shutdown already in progress. Ignoring duplicate request.'
      );

      return;
    }

    this.shuttingDown = true;

    shutdownLog(
      `Bot is shutting down (${reason})...`
    );

    logger.info('\n' + '='.repeat(60));

    logger.info(
      `Graceful Shutdown Initiated (${reason})`
    );

    logger.info('='.repeat(60));


    try {
      // STOP CRON
      logger.info('Stopping cron jobs...');

      cron.getTasks().forEach(task => task.stop());

      logger.info('Cron jobs stopped');


      // STOP MUSIC
      logger.info('Stopping music players...');

      try {
        await shutdownMusic(this);

        logger.info('Music players stopped');

      } catch (error) {
        logger.warn(
          'Error stopping music players:',
          error.message
        );
      }


      // CLOSE WEB SERVER
      if (this.webServer) {
        logger.info('Closing web server...');

        await new Promise(resolve => {
          this.webServer.close(error => {
            if (error) {
              logger.warn(
                'Error closing web server:',
                error.message
              );
            }

            resolve();
          });
        });

        logger.info('Web server closed');
      }


      // CLOSE DATABASE
      if (this.db?.db?.pool) {
        logger.info('Closing PostgreSQL connection...');

        try {
          await this.db.db.pool.end();

          logger.info('Database connection closed');

        } catch (error) {
          logger.warn(
            'Error closing database pool:',
            error.message
          );

          exitCode = 1;
        }
      }


      // DESTROY DISCORD CLIENT
      logger.info('Destroying Discord client...');

      try {
        this.destroy();

        logger.info('Discord client destroyed');

      } catch (error) {
        logger.warn(
          'Discord client destroy warning:',
          error.message
        );
      }


      logger.info('Graceful shutdown complete');

      shutdownLog('Bot stopped successfully.');

      process.exit(exitCode);

    } catch (error) {
      logger.error(
        'Error during graceful shutdown:',
        error
      );

      process.exit(1);
    }
  }
}


// ==============================================
// APPLICATION ENTRY POINT
// ==============================================

try {
  const bot = new TitanBot();


  // ============================================
  // PROCESS SIGNAL HANDLERS
  // ============================================

  process.on('SIGTERM', () => {
    bot.shutdown('SIGTERM', 0);
  });


  process.on('SIGINT', () => {
    bot.shutdown('SIGINT', 0);
  });


  // ============================================
  // UNCAUGHT EXCEPTION
  // ============================================

  process.on('uncaughtException', error => {
    handleTaskError(
      'uncaught_exception',
      error,
      { fatal: true }
    );

    bot.shutdown(
      'UNCAUGHT_EXCEPTION',
      1
    );
  });


  // ============================================
  // UNHANDLED REJECTION
  // ============================================

  process.on('unhandledRejection', reason => {
    const code = reason?.code;


    // Recoverable Discord interaction errors.
    if (
      code === 10062 ||
      code === 40060 ||
      code === 50027
    ) {
      logger.warn(
        'Recoverable Discord interaction rejection:',
        reason?.message || reason
      );

      return;
    }


    // Ignore known empty queue condition.
    if (
      reason?.message?.includes('Queue is empty')
    ) {
      return;
    }


    // Log unexpected promise rejections.
    handleTaskError(
      'unhandled_rejection',
      reason instanceof Error
        ? reason
        : new Error(String(reason)),
      {
        errorCode: ErrorCodes.UNHANDLED_REJECTION
      }
    );
  });


  // ============================================
  // START APPLICATION
  // ============================================

  bot.start().catch(async error => {
    logger.error(
      'Fatal error during bot startup:',
      error
    );

    await bot.shutdown(
      'STARTUP_ERROR',
      1
    );
  });

} catch (error) {
  logger.error(
    'Fatal error during application initialization:',
    error
  );

  process.exit(1);
}


export default TitanBot;
