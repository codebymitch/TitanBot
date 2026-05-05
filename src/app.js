import 'dotenv/config';
import { Client, Collection, GatewayIntentBits } from 'discord.js';
import { REST } from '@discordjs/rest';
import express from 'express';
import cron from 'node-cron';

import config from './config/application.js';
import { initializeDatabase } from './utils/database.js';
import { getServerCounters, updateCounter } from './services/serverstatsService.js';
import { logger, startupLog } from './utils/logger.js';
import { checkBirthdays } from './services/birthdayService.js';
import { checkGiveaways } from './services/giveawayService.js';
import { loadCommands, registerCommands as registerSlashCommands } from './handlers/commandLoader.js';

// 🔥 DASHBOARD
import { setupDashboard } from './dashboard/index.js';

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

      startupLog('Initializing database...');
      const dbInstance = await initializeDatabase();
      this.db = dbInstance.db;

      const dbStatus = this.db.getStatus();
      startupLog(`Database Status: ${dbStatus.connectionType}`);

      // 🔥 WEB SERVER
      this.startWebServer();

      startupLog('Loading commands...');
      await loadCommands(this);

      startupLog('Loading handlers...');
      await this.loadHandlers();

      startupLog('Logging into Discord...');
      await this.login(this.config.bot.token);

      startupLog('Registering slash commands...');
      await this.registerCommands();

      startupLog(`ONLINE ✅ | ${this.commands.size} commands loaded`);

      this.setupCronJobs();

    } catch (error) {
      logger.error('Failed to start bot:', error);
      process.exit(1);
    }
  }

  startWebServer() {
    const app = express();

    // 🔥 DASHBOARD (PRIMERO SIEMPRE)
    setupDashboard(app, this);

    // 🔥 ROOT
    app.get('/', (req, res) => {
      res.json({ message: 'TitanBot Online' });
    });

    // 🔥 FIX EXPRESS 5 (ANTES ERA app.get('*'))
    app.use((req, res) => {
      res.status(404).send(`Ruta no encontrada: ${req.url}`);
    });

    const PORT = process.env.PORT || 3000;

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Web activa en puerto ${PORT}`);
    });
  }

  setupCronJobs() {
    cron.schedule('0 6 * * *', () => checkBirthdays(this));
    cron.schedule('* * * * *', () => checkGiveaways(this));

    cron.schedule('*/15 * * * *', async () => {
      try {
        await this.updateAllCounters();
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
    } catch (error) {
      logger.error('Error updating counters:', error);
    }
  }

  async loadHandlers() {
    const handlers = [
      { path: 'events' },
      { path: 'interactions' }
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