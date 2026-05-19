import { hasGuildAdmin } from '../lib/oauth.js';

export function requireLogin(req, res, next) {
  if (!req.session?.user) {
    req.session = req.session || {};
    req.session.returnTo = req.originalUrl;
    return res.redirect('/login');
  }
  return next();
}

/**
 * Authorises a specific guild. Closes the IDOR: it is NOT enough to
 * be logged in — the user must actually have ADMINISTRATOR/MANAGE_GUILD
 * on THIS guild (from their OAuth guild list) and the bot must be in it.
 * On success, the resolved discord.js Guild is attached as req.guild.
 */
export function makeRequireGuildAdmin(client) {
  return function requireGuildAdmin(req, res, next) {
    if (!req.session?.user) {
      req.session = req.session || {};
      req.session.returnTo = req.originalUrl;
      return res.redirect('/login');
    }

    const guildId = req.params.id;
    const entry = (req.session.guilds || []).find((g) => g.id === guildId);

    if (!entry || !hasGuildAdmin(entry)) {
      return res.status(403).send(deny('No tienes permisos de administrador en ese servidor.'));
    }

    const guild = client.guilds.cache.get(guildId);
    if (!guild) {
      return res.status(404).send(deny('El bot no está en ese servidor.'));
    }

    req.guild = guild;
    return next();
  };
}

function deny(message) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Acceso denegado</title></head>
  <body style="font-family:system-ui;background:#0c0e14;color:#e6e8ee;display:grid;place-items:center;height:100vh;margin:0">
  <div style="text-align:center;max-width:420px">
  <h1 style="color:#ef4444;font-size:64px;margin:0">403</h1>
  <p style="color:#9aa0b4">${message}</p>
  <a href="/dashboard" style="color:#7c5cff;text-decoration:none">← Volver al panel</a>
  </div></body></html>`;
}
