import session from 'express-session';
import axios from 'axios';

export function setupDashboard(app, client) {

  console.log('🔥 Dashboard cargado');

  app.use(session({
    secret: process.env.SESSION_SECRET || 'wk-secret',
    resave: false,
    saveUninitialized: false
  }));

  // 🔐 LOGIN DISCORD (AHORA CON GUILDS)
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

      // 🔥 USER
      const userRes = await axios.get(
        'https://discord.com/api/users/@me',
        {
          headers: {
            Authorization: `Bearer ${accessToken}`
          }
        }
      );

      // 🔥 GUILDS (NUEVO)
      const guildsRes = await axios.get(
        'https://discord.com/api/users/@me/guilds',
        {
          headers: {
            Authorization: `Bearer ${accessToken}`
          }
        }
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

          <h2>Servidores tuyos</h2>

          <ul>
            ${guilds.map(g => `<li>${g.name}</li>`).join('')}
          </ul>

          <br>
          <a href="/logout" style="color:red;">Cerrar sesión</a>

        </body>
      </html>
    `);
  });

  // 🔓 LOGOUT
  app.get('/logout', (req, res) => {
    req.session.destroy(() => {
      res.redirect('/');
    });
  });

}