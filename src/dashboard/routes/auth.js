import express from 'express';
import { logger } from '../../utils/logger.js';
import {
  buildAuthUrl,
  makeState,
  exchangeCode,
  fetchIdentity,
} from '../lib/oauth.js';

export function authRoutes() {
  const router = express.Router();

  router.get('/login', (req, res) => {
    if (req.session.user) return res.redirect('/dashboard');
    const state = makeState();
    req.session.oauthState = state;
    res.redirect(buildAuthUrl(state));
  });

  router.get('/callback', async (req, res) => {
    const { code, state } = req.query;

    if (!code || !state || state !== req.session.oauthState) {
      return res.status(400).send(simplePage('Inicio de sesión inválido o expirado. Inténtalo de nuevo.'));
    }
    delete req.session.oauthState;

    try {
      const token = await exchangeCode(String(code));
      const { user, guilds } = await fetchIdentity(token.access_token);

      req.session.user = {
        id: user.id,
        username: user.username,
        global_name: user.global_name,
        avatar: user.avatar,
      };
      req.session.guilds = guilds;

      const returnTo = req.session.returnTo || '/dashboard';
      delete req.session.returnTo;
      res.redirect(returnTo);
    } catch (err) {
      logger.error('OAuth callback failed', { error: err?.message });
      res.status(500).send(simplePage('No se pudo completar el inicio de sesión con Discord.'));
    }
  });

  router.get('/logout', (req, res) => {
    req.session.destroy(() => res.redirect('/'));
  });

  router.get('/invite', (req, res) => {
    const clientId = process.env.CLIENT_ID || '';
    const url =
      `https://discord.com/oauth2/authorize?client_id=${encodeURIComponent(clientId)}` +
      `&permissions=8&scope=bot%20applications.commands`;
    res.redirect(url);
  });

  return router;
}

function simplePage(message) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Wolf</title>
  <link rel="stylesheet" href="/assets/style.css"></head>
  <body><div class="landing"><div class="hero"><h1>Ups</h1>
  <p>${message}</p><div class="cta"><a class="btn btn-lg" href="/login">Reintentar</a></div>
  </div></div></body></html>`;
}
