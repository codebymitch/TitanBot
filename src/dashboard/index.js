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

    if (!req.session.user) {
      return res.redirect('/login');
    }

    const user = req.session.user;
    const guilds = req.session.guilds || [];

    const adminGuilds = guilds.filter(g => (g.permissions & 0x8) === 0x8);

    res.send(`
      <html>
        <body style="background:#111;color:white;font-family:Arial;padding:20px;">

          <h1>WK' Bot Dashboard</h1>

          <img src="https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png"
               width="80"
               style="border-radius:50%">

          <p>Usuario: ${user.username}</p>
          <p>Bot activo ✅</p>
          <p>Servidores (bot): ${client.guilds.cache.size}</p>

          <h2>Servidores que puedes administrar</h2>

          <ul>
            ${adminGuilds.map(g => `
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

  // 🧠 PANEL POR SERVIDOR (CON DB)
  app.get('/server/:id', async (req, res) => {

    if (!req.session.user) {
      return res.redirect('/login');
    }

    const serverId = req.params.id;

    const { getGuildConfig } = await import('../services/guildConfigService.js');

    const config = await getGuildConfig(client.db, serverId);

    res.send(`
      <html>
        <body style="background:#111;color:white;font-family:Arial;padding:20px;">

          <h1>Panel del servidor</h1>

          <p>ID: ${serverId}</p>

          <h3>Welcome System</h3>

          <p>Estado: ${config.welcome_enabled ? '🟢 Activado' : '🔴 Desactivado'}</p>

          <form method="POST" action="/server/${serverId}/welcome">
            <button type="submit">
              ${config.welcome_enabled ? 'Desactivar' : 'Activar'}
            </button>
          </form>

          <br>
          <a href="/dashboard">⬅ Volver</a>

        </body>
      </html>
    `);
  });

  // 🔥 GUARDAR EN DB
  app.post('/server/:id/welcome', async (req, res) => {

    const serverId = req.params.id;

    const { getGuildConfig, updateWelcome } = await import('../services/guildConfigService.js');

    const config = await getGuildConfig(client.db, serverId);

    await updateWelcome(client.db, serverId, !config.welcome_enabled);

    res.redirect(`/server/${serverId}`);
  });

  // 🔓 LOGOUT
  app.get('/logout', (req, res) => {
    req.session.destroy(() => {
      res.redirect('/');
    });
  });

}