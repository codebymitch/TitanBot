import 'dotenv/config';
import { Client, Collection, GatewayIntentBits } from 'discord.js';
import { REST } from '@discordjs/rest';
import express from 'express';
import cron from 'node-cron';

import config from './config/application.js';
import { initializeDatabase } from './utils/database.js';
import { getGuildConfig } from './services/guildConfig.js';
import { getServerCounters, saveServerCounters, updateCounter } from './services/serverstatsService.js';
import { logger, startupLog, shutdownLog } from './utils/logger.js';
import { checkBirthdays } from './services/birthdayService.js';
import { checkGiveaways } from './services/giveawayService.js';
import { loadCommands, registerCommands as registerSlashCommands } from './handlers/commandLoader.js';

class TitanBot extends Client {
  constructor() {
    super({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,

        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.MessageContent,

        GatewayIntentBits.GuildVoiceStates,

        GatewayIntentBits.GuildBans,
      ],
      partials: ['USER']
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
      const dbInstance = await initializeDatabase();
      this.db = dbInstance.db;
      
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
    const host = process.env.WEB_HOST || '0.0.0.0';

    app.get('/', (req, res) => {
      res.json({ message: 'TitanBot Online' });
    });

    app.listen(configuredPort, host, () => {
      startupLog(`Web Server running on ${host}:${configuredPort}`);
    });
  }

  setupCronJobs() {
    cron.schedule('0 6 * * *', () => checkBirthdays(this));
    cron.schedule('* * * * *', () => checkGiveaways(this));

    // 🔥 FIX TOTAL (NO MÁS ERROR)
    cron.schedule('*/15 * * * *', async () => {
      try {
        if (typeof this.updateAllCounters === 'function') {
          await this.updateAllCounters();
        } else {
          logger.warn('updateAllCounters no existe (skip)');
        }
      } catch (err) {
        logger.error('Error en cron counters:', err);
      }
    });
  }

  async updateAllCounters() {
    try {
      for (const guild of this.guilds.cache.values()) {
        const counters = await getServerCounters(this, guild.id);

        for (const counter of counters) {
          await updateCounter(this, guild, counter);
        }
      }

      logger.info('Counters actualizados correctamente');
    } catch (error) {
      logger.error('Error updating counters:', error);
    }
  }

  async loadHandlers() {
    const handlers = [
      { path: 'events', required: true },
      { path: 'interactions', required: true }
    ];

    for (const handler of handlers) {
      const module = await import(`./handlers/${handler.path}.js`);
      await module.default(this);
    }
  }

  async registerCommands() {
    await registerSlashCommands(this, this.config.bot.guildId);
  }
}

const bot = new TitanBot();
bot.start();
