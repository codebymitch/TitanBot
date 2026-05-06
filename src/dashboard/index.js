import session from 'express-session';
import axios from 'axios';
import express from 'express';

export function setupDashboard(app, client) {

  console.log('🔥 Dashboard cargado');

  app.use(express.urlencoded({ extended: true }));

  app.use(session({
    secret: process.env.SESSION_SECRET || 'wk-secret',
    resave: false,
    saveUninitialized: false
  }));

  // 🔐 LOGIN DISCORD
  app.get('/login', (req, res) => {
    const url = `https://discord.com/api/oauth2/authorize?client_id=${process.env.CLIENT_ID}&redirect_uri=${encodeURIComponent(process.env.REDIRECT_URI)}&response_type=code&scope=identify%20guilds`;
    res.redirect(url);
  });

  // 🔐 CALLBACK
  app.get('/callback', async (req, res) => {
    const code = req.query.code;

    try {
      const tokenRes = await axios.post(
        'https://discord.com/api/oauth2/token',
        new URLSearchParams({
          client_id: process.env.CLIENT_ID,
          client_secret: process.env.CLIENT_SECRET,
          grant_type: 'authorization_code',
          code,
          redirect_uri: process.env.REDIRECT_URI
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      const accessToken = tokenRes.data.access_token;

      const userRes = await axios.get(
        'https://discord.com/api/users/@me',
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      const guildsRes = await axios.get(
        'https://discord.com/api/users/@me/guilds',
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      req.session.user = userRes.data;
      req.session.guilds = guildsRes.data;

      res.redirect('/dashboard');

    } catch (err) {
      console.error(err);
      res.send('❌ Error en login');
    }
  });

  // 🧠 DASHBOARD
  app.get('/dashboard', (req, res) => {

    if (!req.session.user) return res.redirect('/login');

    const user = req.session.user;
    const guilds = req.session.guilds || [];

    const adminGuilds = guilds.filter(g => (g.permissions & 0x8) === 0x8);
    const botGuildIds = client.guilds.cache.map(g => g.id);
    const filteredGuilds = adminGuilds.filter(g => botGuildIds.includes(g.id));

    res.send(`
      <html>
        <body style="background:#111;color:white;font-family:Arial;padding:20px;">

          <h1>WK' Bot Dashboard</h1>

          <img src="https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png"
               width="80"
               style="border-radius:50%">

          <p>Usuario: ${user.username}</p>

          <h2>Servidores</h2>

          <ul>
            ${filteredGuilds.map(g => `
              <li>
                <a href="/server/${g.id}" style="color:#00ffcc;">
                  ${g.name}
                </a>
              </li>
            `).join('')}
          </ul>

          <br>
          <a href="/logout" style="color:red;">Cerrar sesión</a>

        </body>
      </html>
    `);
  });

  // 🧠 PANEL POR SERVIDOR
  app.get('/server/:id', async (req, res) => {

    if (!req.session.user) return res.redirect('/login');

    const serverId = req.params.id;

    const { getGuildConfig } = await import('../services/guildConfigService.js');
    const config = await getGuildConfig(client.db, serverId);

    const guild = client.guilds.cache.get(serverId);

    const channels = guild.channels.cache
      .filter(c => c.type === 0)
      .map(c => `
        <option value="${c.id}">
          #${c.name}
        </option>
      `).join('');

    res.send(`
      <html>
        <body style="background:#111;color:white;font-family:Arial;padding:20px;">

          <h1>${guild.name}</h1>

          <!-- WELCOME -->

          <h2>Welcome</h2>

          <p>${config.welcome_enabled ? '🟢 Activado' : '🔴 Desactivado'}</p>

          <form method="POST" action="/server/${serverId}/welcome">
            <button>
              ${config.welcome_enabled ? 'Desactivar' : 'Activar'}
            </button>
          </form>

          <br>

          <form method="POST" action="/server/${serverId}/channel">
            <select name="channel">
              ${channels}
            </select>

            <button>Guardar canal welcome</button>
          </form>

          <br>

          <form method="POST" action="/server/${serverId}/message">
            <input
              type="text"
              name="message"
              value="${config.welcome_message || ''}"
              style="width:300px;"
            >

            <button>Guardar mensaje</button>
          </form>

          <p>Variables: {user}, {server}</p>

          <hr>

          <!-- LOGS -->

          <h2>Logs</h2>

          <p>${config.logging_enabled ? '🟢 Activados' : '🔴 Desactivados'}</p>

          <form method="POST" action="/server/${serverId}/logs/toggle">
            <button>
              ${config.logging_enabled ? 'Desactivar Logs' : 'Activar Logs'}
            </button>
          </form>

          <br>

          <form method="POST" action="/server/${serverId}/logs/channel">
            <select name="channel">
              ${channels}
            </select>

            <button>Guardar canal logs</button>
          </form>

          <br><br>

          <a href="/dashboard">⬅ Volver</a>

        </body>
      </html>
    `);
  });

  // 🔥 TOGGLE WELCOME
  app.post('/server/:id/welcome', async (req, res) => {

    const serverId = req.params.id;

    const {
      getGuildConfig,
      updateWelcome
    } = await import('../services/guildConfigService.js');

    const config = await getGuildConfig(client.db, serverId);

    await updateWelcome(
      client.db,
      serverId,
      !config.welcome_enabled
    );

    res.redirect(`/server/${serverId}`);
  });

  // 🔥 GUARDAR CANAL WELCOME
  app.post('/server/:id/channel', async (req, res) => {

    const serverId = req.params.id;

    const {
      updateWelcomeChannel
    } = await import('../services/guildConfigService.js');

    await updateWelcomeChannel(
      client.db,
      serverId,
      req.body.channel
    );

    res.redirect(`/server/${serverId}`);
  });

  // 🔥 MENSAJE WELCOME
  app.post('/server/:id/message', async (req, res) => {

    const serverId = req.params.id;

    const {
      updateWelcomeMessage
    } = await import('../services/guildConfigService.js');

    await updateWelcomeMessage(
      client.db,
      serverId,
      req.body.message
    );

    res.redirect(`/server/${serverId}`);
  });

  // 🔥 TOGGLE LOGS
  app.post('/server/:id/logs/toggle', async (req, res) => {

    const serverId = req.params.id;

    const {
      getGuildConfig,
      updateLogging
    } = await import('../services/guildConfigService.js');

    const config = await getGuildConfig(client.db, serverId);

    await updateLogging(
      client.db,
      serverId,
      !config.logging_enabled
    );

    res.redirect(`/server/${serverId}`);
  });

  // 🔥 GUARDAR CANAL LOGS
  app.post('/server/:id/logs/channel', async (req, res) => {

    const serverId = req.params.id;

    const {
      updateLogChannel
    } = await import('../services/guildConfigService.js');

    await updateLogChannel(
      client.db,
      serverId,
      req.body.channel
    );

    res.redirect(`/server/${serverId}`);
  });

  app.get('/logout', (req, res) => {
    req.session.destroy(() => res.redirect('/'));
  });

}