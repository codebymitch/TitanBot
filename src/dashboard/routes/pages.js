import express from 'express';
import { logger } from '../../utils/logger.js';
import { getGuildConfig } from '../../services/guildConfigService.js';
import { ensureCsrfToken } from '../lib/csrf.js';
import { manageableGuilds } from '../lib/oauth.js';
import { requireLogin, makeRequireGuildAdmin } from '../middleware/auth.js';
import { renderLanding } from '../views/landing.js';
import { renderDashboard } from '../views/dashboardPage.js';
import { renderServer } from '../views/serverPage.js';

function takeFlash(req) {
  const flash = req.session?.flash || null;
  if (req.session) delete req.session.flash;
  return flash;
}

export function pageRoutes(client) {
  const router = express.Router();
  const requireGuildAdmin = makeRequireGuildAdmin(client);

  router.get('/', (req, res) => {
    res.send(renderLanding({ loggedIn: Boolean(req.session.user) }));
  });

  router.get('/dashboard', requireLogin, (req, res) => {
    const guilds = manageableGuilds(req.session.guilds, client);
    res.send(
      renderDashboard({
        user: req.session.user,
        client,
        guilds,
        flash: takeFlash(req),
      }),
    );
  });

  router.get('/server/:id', requireGuildAdmin, async (req, res) => {
    try {
      const config = await getGuildConfig(client.db, req.guild.id);
      res.send(
        renderServer({
          user: req.session.user,
          guild: req.guild,
          config,
          csrf: ensureCsrfToken(req),
          flash: takeFlash(req),
        }),
      );
    } catch (err) {
      logger.error('Dashboard server page failed', { error: err?.message });
      res.status(500).send('Error cargando la configuración del servidor.');
    }
  });

  return router;
}
