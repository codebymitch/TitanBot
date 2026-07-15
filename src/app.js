import 'dotenv/config';
import { Client, Collection, GatewayIntentBits, Partials } from 'discord.js';
import { REST } from '@discordjs/rest';
import express from 'express';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Dashboard auth helpers ────────────────────────────────────────
const DASHBOARD_SECRET = process.env.DASHBOARD_SECRET || crypto.randomBytes(32).toString('hex');

function createToken(payload, remember = false) {
  const base = { ...payload };
  if (!remember) base.exp = Date.now() + 24 * 3600 * 1000;
  const data = Buffer.from(JSON.stringify(base)).toString('base64');
  const sig = crypto.createHmac('sha256', DASHBOARD_SECRET).update(data).digest('hex');
  return `${data}.${sig}`;
}

function verifyToken(token) {
  if (!token) return null;
  const dot = token.lastIndexOf('.');
  if (dot < 0) return null;
  const data = token.slice(0, dot);
  const sig  = token.slice(dot + 1);
  const expected = crypto.createHmac('sha256', DASHBOARD_SECRET).update(data).digest('hex');
  if (sig !== expected) return null;
  try {
    const payload = JSON.parse(Buffer.from(data, 'base64').toString());
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
  } catch { return null; }
}

import config from './config/application.js';
import { initializeDatabase } from './utils/database.js';
import { getGuildConfig } from './services/guildConfig.js';
import { logger, startupLog, shutdownLog } from './utils/logger.js';
import { loadCommands, registerCommands as registerSlashCommands } from './handlers/commandLoader.js';

class TitanBot extends Client {
  constructor() {
    super({
      intents: [
        
        GatewayIntentBits.Guilds,                        
        GatewayIntentBits.GuildMembers,                 
        
        
        GatewayIntentBits.GuildMessages,                
        GatewayIntentBits.MessageContent,               
        
        GatewayIntentBits.GuildVoiceStates,             
        
        
        GatewayIntentBits.GuildBans,
      ],
      partials: [Partials.Message, Partials.Channel, Partials.GuildMember, Partials.User],
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
    const maxPortRetryAttempts = Number(process.env.PORT_RETRY_ATTEMPTS || 5);
    const host = process.env.WEB_HOST || '0.0.0.0';
    const corsOrigin = this.config.api?.cors?.origin || '*';
    
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

    // ── Static files ──────────────────────────────────────────────
    app.use(express.static(path.join(__dirname, '../public')));
    app.use(express.json());

    // ── Page routes ───────────────────────────────────────────────
    app.get('/',          (req, res) => res.redirect('/dashboard'));
    app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, '../public/dashboard.html')));
    app.get('/login',     (req, res) => res.sendFile(path.join(__dirname, '../public/login.html')));

    // ── Public API ────────────────────────────────────────────────
    app.get('/api/botinfo', (req, res) => {
      res.json({
        username: this.user?.username || 'Bot',
        avatar:   this.user?.displayAvatarURL({ size: 128 }) || '',
      });
    });

    app.get('/api/loginconfig', (req, res) => {
      res.json({
        username:       this.user?.username || 'Bot',
        avatar:         this.user?.displayAvatarURL({ size: 128 }) || '',
        discordEnabled: !!process.env.CLIENT_SECRET,
        emailEnabled:   !!process.env.DASHBOARD_EMAIL,
      });
    });

    // ── Discord OAuth2 ────────────────────────────────────────────
    app.get('/auth/discord', (req, res) => {
      if (!process.env.CLIENT_SECRET) {
        return res.redirect('/login?error=oauth_disabled');
      }
      const redirectUri = process.env.REDIRECT_URI || `http://localhost:${process.env.PORT || 3000}/auth/discord/callback`;
      const params = new URLSearchParams({
        client_id:     process.env.CLIENT_ID,
        redirect_uri:  redirectUri,
        response_type: 'code',
        scope:         'identify',
        state:         req.query.remember === '1' ? '1' : '0',
      });
      res.redirect(`https://discord.com/api/oauth2/authorize?${params}`);
    });

    app.get('/auth/discord/callback', async (req, res) => {
      const { code } = req.query;
      if (!code) return res.redirect('/login?error=no_code');
      try {
        const redirectUri = process.env.REDIRECT_URI || `http://localhost:${process.env.PORT || 3000}/auth/discord/callback`;
        const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
          method:  'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id:     process.env.CLIENT_ID,
            client_secret: process.env.CLIENT_SECRET,
            grant_type:    'authorization_code',
            code,
            redirect_uri:  redirectUri,
          }),
        });
        if (!tokenRes.ok) return res.redirect('/login?error=token_failed');
        const { access_token } = await tokenRes.json();

        const userRes = await fetch('https://discord.com/api/users/@me', {
          headers: { Authorization: `Bearer ${access_token}` },
        });
        if (!userRes.ok) return res.redirect('/login?error=user_failed');
        const user = await userRes.json();

        const ownerIds = process.env.OWNER_IDS?.split(',').map(id => id.trim()) ?? [];
        const isOwner  = ownerIds.includes(user.id);
        const remember = req.query.state === '1';
        const token    = createToken({ userId: user.id, username: user.username, isOwner }, remember);

        res.send(`<!DOCTYPE html><html><head><script>
          localStorage.setItem('dashboard_token', ${JSON.stringify(token)});
          window.location.href = '/dashboard';
        </script></head></html>`);
      } catch (err) {
        logger.error('Discord OAuth2 callback error:', err);
        res.redirect('/login?error=token_failed');
      }
    });

    // ── Email login ───────────────────────────────────────────────
    app.post('/api/login/email', (req, res) => {
      const { email, password, remember } = req.body || {};
      const cfgEmail = process.env.DASHBOARD_EMAIL;
      const cfgPass  = process.env.DASHBOARD_PASSWORD;
      if (!cfgEmail) return res.status(404).json({ error: 'Email login is not configured.' });
      if (!email || !password || email !== cfgEmail || password !== cfgPass) {
        return res.status(401).json({ error: 'Invalid email or password.' });
      }
      const ownerIds = process.env.OWNER_IDS?.split(',').map(id => id.trim()) ?? [];
      const isOwner  = ownerIds.includes(process.env.DASHBOARD_OWNER_ID || '') || true;
      const token    = createToken({ userId: email, username: email.split('@')[0], isOwner }, !!remember);
      res.json({ token });
    });

    // ── Auth middleware ───────────────────────────────────────────
    const auth = (req, res, next) => {
      const hdr = req.headers.authorization;
      if (!hdr?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
      const payload = verifyToken(hdr.slice(7));
      if (!payload) return res.status(401).json({ error: 'Invalid or expired token' });
      req.user = payload;
      next();
    };

    // ── Protected API ─────────────────────────────────────────────
    app.get('/api/me', auth, (req, res) => res.json(req.user));

    app.get('/api/stats', auth, (req, res) => {
      const dbStatus = this.db?.getStatus?.() || {};
      res.json({
        username: this.user?.username || 'Bot',
        avatar:   this.user?.displayAvatarURL({ size: 128 }) || '',
        guilds:   this.guilds.cache.size,
        users:    this.guilds.cache.reduce((a, g) => a + (g.memberCount || 0), 0),
        commands: this.commands.size,
        uptime:   process.uptime(),
        ping:     Math.round(this.ws.ping),
        dbStatus: dbStatus.isDegraded ? '⚠️ Degraded' : '✅ Online',
        isOwner:  req.user.isOwner,
      });
    });

    app.get('/api/commands', auth, (req, res) => {
      const categories = {};
      for (const [name, cmd] of this.commands) {
        const cat = cmd.category
          ? cmd.category.charAt(0).toUpperCase() + cmd.category.slice(1)
          : 'Other';
        if (!categories[cat]) categories[cat] = [];
        categories[cat].push(name);
      }
      res.json(categories);
    });

    app.get('/api/servers', auth, (req, res) => {
      const servers = this.guilds.cache.map(g => ({
        id:          g.id,
        name:        g.name,
        memberCount: g.memberCount || 0,
        icon:        g.iconURL({ size: 64 }) || null,
      })).sort((a, b) => b.memberCount - a.memberCount);
      res.json(servers);
    });

    app.get('/api/servers/:guildId/invite', auth, async (req, res) => {
      const guild = this.guilds.cache.get(req.params.guildId);
      if (!guild) return res.status(404).json({ error: 'Server not found' });
      const channel = guild.channels.cache.find(c =>
        c.isTextBased() && !c.isThread() &&
        guild.members.me?.permissionsIn(c).has('CreateInstantInvite')
      );
      if (!channel) return res.status(403).json({ error: 'No channel available to create invite' });
      try {
        const invite = await channel.createInvite({ maxAge: 0, maxUses: 0, unique: false });
        res.json({ url: invite.url });
      } catch (err) {
        logger.error('Failed to create invite:', err);
        res.status(500).json({ error: 'Could not create invite' });
      }
    });

    app.get('/api/botinvite', auth, (req, res) => {
      const clientId = process.env.CLIENT_ID;
      if (!clientId) return res.status(500).json({ error: 'CLIENT_ID not set' });
      const url = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&permissions=8&scope=bot+applications.commands`;
      res.json({ url });
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
      const isReady = this.isReady() && !dbStatus.isDegraded;

      if (isReady) {
        return res.status(200).json({
          ready: true,
          message: 'Bot is ready'
        });
      }

      res.status(503).json({
        ready: false,
        reason: !this.isReady() ? 'Bot not Ready' : 'Database degraded'
      });
    });


    const startServer = (port, attempt = 0) => {
      let hasStartedListening = false;
      const server = app.listen(port, host, () => {
        hasStartedListening = true;
        this.webServer = server;
        startupLog(`✅ Web Server running on ${host}:${port}`);
        startupLog(`Health endpoint: http://localhost:${port}/health`);
        startupLog(`Ready endpoint: http://localhost:${port}/ready`);
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
    // Reserved for future scheduled tasks. This release has no background jobs.
  }

  async loadHandlers() {
    const handlers = [
      { path: 'events', type: 'default', required: true },
      { path: 'interactions', type: 'default', required: true }
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
      // Clear leftover guild-specific commands if a guild ID is configured
      if (this.config.bot.guildId) {
        try {
          const guild = await this.guilds.fetch(this.config.bot.guildId);
          await guild.commands.set([]);
          logger.info('Cleared guild-specific commands — now using global registration');
        } catch (e) {
          logger.warn('Could not clear guild commands:', e.message);
        }
      }
      // Pass null to register globally (works across all servers)
      await registerSlashCommands(this, null);
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

