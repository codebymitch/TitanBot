import express from 'express';
import { logger } from '../../utils/logger.js';
import {
  getGuildConfig,
  updateLanguage,
  updateWelcome,
  updateWelcomeChannel,
  updateWelcomeMessage,
  updateLogChannel,
} from '../../services/guildConfigService.js';
import {
  setLoggingEnabled,
  setEventEnabled,
} from '../../services/loggingService.js';
import { makeRequireGuildAdmin } from '../middleware/auth.js';

const KNOWN_CATEGORIES = new Set([
  'moderation', 'message', 'member', 'role', 'channel', 'thread', 'voice',
  'emoji', 'sticker', 'server', 'invite', 'webhook', 'event', 'integration',
  'ticket', 'leveling', 'reactionrole', 'giveaway', 'counter',
]);

function flashBack(req, res, type, msg) {
  req.session.flash = { type, msg };
  res.redirect(`/server/${req.guild.id}`);
}

// '' => null (clear). Otherwise must be a real text channel in the guild.
function resolveChannel(guild, raw) {
  if (raw === undefined || raw === null || raw === '') return { ok: true, id: null };
  const ch = guild.channels.cache.get(String(raw));
  if (!ch || ch.type !== 0) return { ok: false };
  return { ok: true, id: ch.id };
}

export function apiRoutes(client) {
  const router = express.Router();
  const requireGuildAdmin = makeRequireGuildAdmin(client);

  router.use('/server/:id', requireGuildAdmin);

  router.post('/server/:id/language', async (req, res) => {
    const lang = req.body.language === 'en' ? 'en' : 'es';
    try {
      await updateLanguage(client.db, req.guild.id, lang);
      flashBack(req, res, 'ok', 'Idioma actualizado.');
    } catch (e) {
      logger.error('dash language', { error: e?.message });
      flashBack(req, res, 'err', 'No se pudo guardar el idioma.');
    }
  });

  router.post('/server/:id/welcome/toggle', async (req, res) => {
    try {
      const cfg = await getGuildConfig(client.db, req.guild.id);
      await updateWelcome(client.db, req.guild.id, !cfg.welcome?.enabled);
      flashBack(req, res, 'ok', 'Bienvenida actualizada.');
    } catch (e) {
      logger.error('dash welcome toggle', { error: e?.message });
      flashBack(req, res, 'err', 'No se pudo cambiar la bienvenida.');
    }
  });

  router.post('/server/:id/welcome/channel', async (req, res) => {
    const ch = resolveChannel(req.guild, req.body.channel);
    if (!ch.ok) return flashBack(req, res, 'err', 'Canal de bienvenida inválido.');
    const message = String(req.body.message || '').slice(0, 1500);
    try {
      await updateWelcomeChannel(client.db, req.guild.id, ch.id);
      await updateWelcomeMessage(client.db, req.guild.id, message);
      flashBack(req, res, 'ok', 'Bienvenida guardada.');
    } catch (e) {
      logger.error('dash welcome channel', { error: e?.message });
      flashBack(req, res, 'err', 'No se pudo guardar la bienvenida.');
    }
  });

  router.post('/server/:id/logs/toggle', async (req, res) => {
    try {
      const status = await getGuildConfig(client.db, req.guild.id);
      await setLoggingEnabled(client, req.guild.id, !status.logs?.enabled);
      flashBack(req, res, 'ok', 'Registros actualizados.');
    } catch (e) {
      logger.error('dash logs toggle', { error: e?.message });
      flashBack(req, res, 'err', 'No se pudo cambiar los registros.');
    }
  });

  router.post('/server/:id/logs/channel', async (req, res) => {
    const ch = resolveChannel(req.guild, req.body.channel);
    if (!ch.ok) return flashBack(req, res, 'err', 'Canal de registros inválido.');
    try {
      await updateLogChannel(client.db, req.guild.id, ch.id);
      flashBack(req, res, 'ok', 'Canal de registros guardado.');
    } catch (e) {
      logger.error('dash logs channel', { error: e?.message });
      flashBack(req, res, 'err', 'No se pudo guardar el canal.');
    }
  });

  router.post('/server/:id/logs/category', async (req, res) => {
    const category = String(req.body.category || '');
    if (!KNOWN_CATEGORIES.has(category)) {
      return flashBack(req, res, 'err', 'Categoría desconocida.');
    }
    const enable = String(req.body.enable) === '1';
    try {
      await setEventEnabled(client, req.guild.id, `${category}.*`, enable);
      flashBack(req, res, 'ok', `Categoría "${category}" ${enable ? 'activada' : 'silenciada'}.`);
    } catch (e) {
      logger.error('dash logs category', { error: e?.message });
      flashBack(req, res, 'err', 'No se pudo cambiar la categoría.');
    }
  });

  return router;
}
