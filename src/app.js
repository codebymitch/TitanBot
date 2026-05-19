import 'dotenv/config';
import { Client, Collection, GatewayIntentBits } from 'discord.js';
import { REST } from '@discordjs/rest';
import express from 'express';
import cron from 'node-cron';

import config from './config/application.js';
import { initializeDatabase } from './utils/database.js';
import { getServerCounters, updateCounter } from './services/serverstatsService.js';
import { logger, startupLog, shutdownLog, printStartupBanner } from './utils/logger.js';
import { checkBirthdays } from './services/birthdayService.js';
import { checkGiveaways } from './services/giveawayService.js';
import { loadCommands, registerCommands as registerSlashCommands } from './handlers/commandLoader.js';

import { setupDashboard } from './dashboard/index.js';
import loadEvents from './handlers/events.js';

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
        GatewayIntentBits.GuildEmojisAndStickers,
        GatewayIntentBits.GuildInvites,
        GatewayIntentBits.GuildWebhooks,
        GatewayIntentBits.GuildScheduledEvents,
      ],
      partials: ['USER'],
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
      startupLog('Initializing database...');
      const dbInstance = await initializeDatabase();
      this.db = dbInstance.db;
      const dbStatus = this.db.getStatus();
      startupLog(`Database ready — ${dbStatus.connectionType}`);

      this.startWebServer();

      startupLog('Loading commands...');
      await loadCommands(this);

      startupLog('Loading events...');
      await loadEvents(this);

      startupLog('Logging into Discord...');
      await this.login(this.config.bot.token);

      startupLog('Registering slash commands...');
      await this.registerCommands();

      // Banner final con resumen del estado
      printStartupBanner(
        this.user?.tag ?? 'Unknown',
        this.commands.size,
        dbStatus.connectionType,
      );

      this.setupCronJobs();

    } catch (error) {
      logger.error('Fatal error during startup — bot will exit', { error });
      process.exit(1);
    }
  }

  startWebServer() {
    const app = express();

    setupDashboard(app, this);

    app.get('/', (req, res) => res.json({ status: 'online', bot: 'TitanBot' }));

    app.use((req, res) => res.status(404).json({ error: `Route not found: ${req.url}` }));

    const PORT = process.env.PORT || 3000;

    app.listen(PORT, '0.0.0.0', () => {
      startupLog(`Web server listening on port ${PORT}`);
    });
  }

  setupCronJobs() {
    cron.schedule('0 6 * * *',    () => checkBirthdays(this));
    cron.schedule('* * * * *',    () => checkGiveaways(this));
    cron.schedule('*/15 * * * *', async () => {
      try {
        await this.updateAllCounters();
      } catch (err) {
        logger.error('Cron error — updateAllCounters failed', { error: err });
      }
    });

    logger.debug('Cron jobs scheduled (birthdays, giveaways, counters)');
  }

  async updateAllCounters() {
    for (const guild of this.guilds.cache.values()) {
      const counters = await getServerCounters(this, guild.id);
      for (const counter of counters) {
        await updateCounter(this, guild, counter);
      }
    }
  }

  async registerCommands() {
    await registerSlashCommands(this, this.config.bot.guildId);
  }
}

// Capturar señales de cierre limpiamente
process.on('SIGTERM', () => {
  shutdownLog('Received SIGTERM — shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  shutdownLog('Received SIGINT — shutting down gracefully');
  process.exit(0);
});

const bot = new TitanBot();
bot.start();