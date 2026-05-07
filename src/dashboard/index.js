import session from 'express-session';
import axios from 'axios';
import express from 'express';
import path from 'path';

import {
  fileURLToPath
} from 'url';

const __filename =
  fileURLToPath(import.meta.url);

const __dirname =
  path.dirname(__filename);

export function setupDashboard(app, client) {

  console.log('🔥 Dashboard cargado');

  app.use(express.urlencoded({
    extended: true
  }));

  app.use(
    '/assets',
    express.static(
      path.join(
        __dirname,
        'public'
      )
    )
  );

  app.use(session({

    secret:
      process.env.SESSION_SECRET ||
      'wk-secret',

    resave: false,
    saveUninitialized: false

  }));

  // =====================================
  // 🔐 LOGIN
  // =====================================

  app.get('/login', (req, res) => {

    const url =

      `https://discord.com/api/oauth2/authorize?client_id=${process.env.CLIENT_ID}&redirect_uri=${encodeURIComponent(process.env.REDIRECT_URI)}&response_type=code&scope=identify%20guilds`;

    res.redirect(url);

  });

  // =====================================
  // 🔐 CALLBACK
  // =====================================

  app.get('/callback', async (req, res) => {

    const code =
      req.query.code;

    try {

      const tokenRes =

        await axios.post(

          'https://discord.com/api/oauth2/token',

          new URLSearchParams({

            client_id:
              process.env.CLIENT_ID,

            client_secret:
              process.env.CLIENT_SECRET,

            grant_type:
              'authorization_code',

            code,

            redirect_uri:
              process.env.REDIRECT_URI

          }),

          {

            headers: {

              'Content-Type':
                'application/x-www-form-urlencoded'

            }
          }
        );

      const accessToken =
        tokenRes.data.access_token;

      const userRes =

        await axios.get(
          'https://discord.com/api/users/@me',
          {

            headers: {

              Authorization:
                `Bearer ${accessToken}`

            }
          }
        );

      const guildsRes =

        await axios.get(
          'https://discord.com/api/users/@me/guilds',
          {

            headers: {

              Authorization:
                `Bearer ${accessToken}`

            }
          }
        );

      req.session.user =
        userRes.data;

      req.session.guilds =
        guildsRes.data;

      res.redirect('/dashboard');

    } catch (err) {

      console.error(err);

      res.send(
        '❌ Error en login'
      );

    }
  });

  // =====================================
  // 🧠 DASHBOARD
  // =====================================

  app.get('/dashboard', (req, res) => {

    if (!req.session.user) {
      return res.redirect('/login');
    }

    const user =
      req.session.user;

    const guilds =
      req.session.guilds || [];

    const adminGuilds =

      guilds.filter(
        g =>
          (g.permissions & 0x8) === 0x8
      );

    const botGuildIds =

      client.guilds.cache.map(
        g => g.id
      );

    const filteredGuilds =

      adminGuilds.filter(
        g =>
          botGuildIds.includes(
            g.id
          )
      );

    res.send(`

      <html>

        <head>

          <link
            rel="stylesheet"
            href="/assets/style.css"
          >

        </head>

        <body>

          <div class="sidebar">

            <h1>
              WK'
            </h1>

            <a href="/dashboard">
              🏠 Dashboard
            </a>

            <a href="/logout">
              🚪 Logout
            </a>

          </div>

          <div class="main">

            <div class="stats-grid">

              <div class="stat-card">

                <h3>
                  🌎 Servers
                </h3>

                <p>
                  ${client.guilds.cache.size}
                </p>

              </div>

              <div class="stat-card">

                <h3>
                  👥 Users
                </h3>

                <p>
                  ${client.guilds.cache.reduce((a, g) => a + g.memberCount, 0)}
                </p>

              </div>

              <div class="stat-card">

                <h3>
                  ⚡ Ping
                </h3>

                <p>
                  ${client.ws.ping}ms
                </p>

              </div>

              <div class="stat-card">

                <h3>
                  🤖 Commands
                </h3>

                <p>
                  ${client.commands.size}
                </p>

              </div>

            </div>

            <div class="card">

              <img
                src="https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png"
                width="90"
                style="
                  border-radius:50%;
                "
              >

              <h2>
                ${user.username}
              </h2>

            </div>

            <div class="card">

              <h2>
                🌎 Servidores
              </h2>

              ${filteredGuilds.map(g => `

                <div
                  style="
                    margin-top:15px;
                  "
                >

                  <a
                    href="/server/${g.id}"

                    style="
                      color:#00ffcc;
                      font-size:18px;
                      text-decoration:none;
                    "
                  >

                    ${g.name}

                  </a>

                </div>

              `).join('')}

            </div>

          </div>

        </body>

      </html>

    `);

  });

  // =====================================
// 🧠 SERVER PANEL (PRO VERSION)
// =====================================

app.get('/server/:id', async (req, res) => {

  if (!req.session.user) {
    return res.redirect('/login');
  }

  const serverId = req.params.id;

  const { getGuildConfig } =
    await import('../services/guildConfigService.js');

  const config = await getGuildConfig(
    client.db,
    serverId
  );

  const guild = client.guilds.cache.get(serverId);

  if (!guild) {
    return res.send('Servidor no encontrado');
  }

  const channels = guild.channels.cache
    .filter(c => c.type === 0)
    .map(c => `
      <option value="${c.id}"
        ${config.logs?.channel === c.id ? 'selected' : ''}>
        #${c.name}
      </option>
    `)
    .join('');

  res.send(`

<html>
<head>

<link rel="stylesheet" href="/assets/style.css">

<style>

body {
  margin:0;
  font-family: Arial;
  background:#0f1117;
  color:white;
  display:flex;
}

.sidebar {
  width:230px;
  background:#151821;
  height:100vh;
  padding:20px;
}

.sidebar h1 {
  color:#00ffcc;
}

.sidebar a {
  display:block;
  margin-top:15px;
  color:#aaa;
  text-decoration:none;
}

.sidebar a:hover {
  color:#00ffcc;
}

.main {
  flex:1;
  padding:30px;
}

.grid {
  display:grid;
  grid-template-columns: repeat(auto-fill, minmax(320px,1fr));
  gap:20px;
  margin-top:20px;
}

.card {
  background:#1a1d29;
  padding:20px;
  border-radius:10px;
  box-shadow:0 0 10px #000;
  transition:0.2s;
}

.card:hover {
  transform:translateY(-3px);
}

button {
  background:#00ffcc;
  border:none;
  padding:8px 15px;
  border-radius:5px;
  cursor:pointer;
  margin-top:5px;
}

select, input {
  width:100%;
  padding:6px;
  margin-top:5px;
  background:#0f1117;
  color:white;
  border:1px solid #333;
  border-radius:5px;
}

.badge {
  padding:3px 8px;
  border-radius:5px;
  font-size:12px;
}

.on { background:#22c55e; }
.off { background:#ef4444; }

</style>

</head>

<body>

<div class="sidebar">
  <h1>WK'</h1>

  <a href="/dashboard">🏠 Dashboard</a>
  <a href="/logout">🚪 Logout</a>
</div>

<div class="main">

  <h1>${guild.name}</h1>

  <div class="grid">

    <!-- LANGUAGE -->
    <div class="card">
      <h2>🌎 Language</h2>

      <span class="badge">${config.language}</span>

      <form method="POST" action="/server/${serverId}/language">
        <select name="language">
          <option value="es" ${config.language === 'es' ? 'selected' : ''}>Español</option>
          <option value="en" ${config.language === 'en' ? 'selected' : ''}>English</option>
        </select>
        <button>Guardar</button>
      </form>
    </div>

    <!-- WELCOME -->
    <div class="card">
      <h2>👋 Welcome</h2>

      <span class="badge ${config.welcome?.enabled ? 'on' : 'off'}">
        ${config.welcome?.enabled ? 'ON' : 'OFF'}
      </span>

      <form method="POST" action="/server/${serverId}/welcome">
        <button>${config.welcome?.enabled ? 'Desactivar' : 'Activar'}</button>
      </form>

      <br>

      <form method="POST" action="/server/${serverId}/channel">
        <select name="channel">
          ${channels}
        </select>
        <button>Guardar canal</button>
      </form>

      <br>

      <form method="POST" action="/server/${serverId}/message">
        <input type="text" name="message" value="${config.welcome?.message || ''}">
        <button>Guardar mensaje</button>
      </form>
    </div>

    <!-- LOGS -->
    <div class="card">
      <h2>📊 Logs</h2>

      <span class="badge ${config.logs?.enabled ? 'on' : 'off'}">
        ${config.logs?.enabled ? 'ON' : 'OFF'}
      </span>

      <form method="POST" action="/server/${serverId}/logs/toggle">
        <button>${config.logs?.enabled ? 'Desactivar' : 'Activar'}</button>
      </form>

      <br>

      <form method="POST" action="/server/${serverId}/logs/mode">
        <select name="mode">
          <option value="single" ${config.logs?.mode === 'single' ? 'selected' : ''}>Single</option>
          <option value="advanced" ${config.logs?.mode === 'advanced' ? 'selected' : ''}>Advanced</option>
        </select>
        <button>Guardar modo</button>
      </form>

      <br>

      ${
        config.logs?.mode !== 'advanced'
        ? `
        <form method="POST" action="/server/${serverId}/logs/channel">
          <select name="channel">
            ${channels}
          </select>
          <button>Guardar canal</button>
        </form>
        `
        : `
        <div>
          ${['message','member','moderation','voice','role','channel'].map(type => `
            <form method="POST" action="/server/${serverId}/logs/category">
              <input type="hidden" name="category" value="${type}">
              <p>📂 ${type}</p>
              <select name="channel">
                ${guild.channels.cache
                  .filter(c => c.type === 0)
                  .map(c => `
                    <option value="${c.id}"
                      ${config.logs?.categories?.[type] === c.id ? 'selected' : ''}>
                      #${c.name}
                    </option>
                  `).join('')}
              </select>
              <button>Guardar</button>
            </form>
          `).join('')}
        </div>
        `
      }

    </div>

  </div>

</div>

</body>
</html>

  `);

});

  // =====================================
  // 🌎 LANGUAGE
  // =====================================

  app.post('/server/:id/language', async (req, res) => {

    const serverId =
      req.params.id;

    const {
      updateLanguage
    } =
      await import(
        '../services/guildConfigService.js'
      );

    await updateLanguage(
      client.db,
      serverId,
      req.body.language
    );

    res.redirect(
      `/server/${serverId}`
    );

  });

  // =====================================
  // 👋 WELCOME
  // =====================================

  app.post('/server/:id/welcome', async (req, res) => {

    const serverId =
      req.params.id;

    const {
      getGuildConfig,
      updateWelcome
    } =
      await import(
        '../services/guildConfigService.js'
      );

    const config =
      await getGuildConfig(
        client.db,
        serverId
      );

    await updateWelcome(
      client.db,
      serverId,
      !config.welcome?.enabled
    );

    res.redirect(
      `/server/${serverId}`
    );

  });

  app.post('/server/:id/channel', async (req, res) => {

    const serverId =
      req.params.id;

    const {
      updateWelcomeChannel
    } =
      await import(
        '../services/guildConfigService.js'
      );

    await updateWelcomeChannel(
      client.db,
      serverId,
      req.body.channel
    );

    res.redirect(
      `/server/${serverId}`
    );

  });

  app.post('/server/:id/message', async (req, res) => {

    const serverId =
      req.params.id;

    const {
      updateWelcomeMessage
    } =
      await import(
        '../services/guildConfigService.js'
      );

    await updateWelcomeMessage(
      client.db,
      serverId,
      req.body.message
    );

    res.redirect(
      `/server/${serverId}`
    );

  });

  // =====================================
  // 📊 LOGS
  // =====================================

  app.post('/server/:id/logs/toggle', async (req, res) => {

    const serverId =
      req.params.id;

    const {
      getGuildConfig,
      updateLogging
    } =
      await import(
        '../services/guildConfigService.js'
      );

    const config =
      await getGuildConfig(
        client.db,
        serverId
      );

    await updateLogging(
      client.db,
      serverId,
      !config.logs?.enabled
    );

    res.redirect(
      `/server/${serverId}`
    );

  });

  app.post('/server/:id/logs/channel', async (req, res) => {

    const serverId =
      req.params.id;

    const {
      updateLogChannel
    } =
      await import(
        '../services/guildConfigService.js'
      );

    await updateLogChannel(
      client.db,
      serverId,
      req.body.channel
    );

    res.redirect(
      `/server/${serverId}`
    );

  });
  // 📂 MODE

app.post('/server/:id/logs/mode', async (req, res) => {

  const serverId = req.params.id;

  const { updateLogMode } =
    await import('../services/guildConfigService.js');

  await updateLogMode(client.db, serverId, req.body.mode);

  res.redirect(`/server/${serverId}`);
});

// 📂 CATEGORY

app.post('/server/:id/logs/category', async (req, res) => {

  const serverId = req.params.id;
  const { category, channel } = req.body;

  const { updateLogCategory } =
    await import('../services/guildConfigService.js');

  await updateLogCategory(client.db, serverId, category, channel);

  res.redirect(`/server/${serverId}`);
});

  // =====================================
  // 🚪 LOGOUT
  // =====================================

  app.get('/logout', (req, res) => {

    req.session.destroy(() =>
      res.redirect('/')
    );

  });

}