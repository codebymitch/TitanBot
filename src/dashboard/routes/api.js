import express from 'express';
import { logger } from '../../utils/logger.js';
import {
  getGuildConfig,
  updateLanguage,
  updateWelcome,
  updateWelcomeChannel,
  updateWelcomeMessage,
  updateLogChannel,
  updateLogCategory,
} from '../../services/guildConfigService.js';
import {
  setLoggingEnabled,
  setEventEnabled,
} from '../../services/loggingService.js';
import { makeRequireGuildAdmin, requireOwner } from '../middleware/auth.js';
import { grantAccess, revokeAccess } from '../../services/accessService.js';

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

  router.post('/server/:id/logs/category-channels', async (req, res) => {
    try {
      let changed = 0;
      for (const cat of KNOWN_CATEGORIES) {
        const raw = req.body[`ch_${cat}`];
        if (raw === undefined) continue;
        const ch = resolveChannel(req.guild, raw);
        if (!ch.ok) {
          return flashBack(req, res, 'err', `Canal inválido para la categoría "${cat}".`);
        }
        await updateLogCategory(client.db, req.guild.id, cat, ch.id);
        changed += 1;
      }
      flashBack(req, res, 'ok', `Enrutamiento guardado (${changed} categorías).`);
    } catch (e) {
      logger.error('dash logs category-channels', { error: e?.message });
      flashBack(req, res, 'err', 'No se pudo guardar el enrutamiento por categoría.');
    }
  });

  // ── Owner-only: subscription/access control ──────────────────────
  router.post('/admin/access', requireOwner, async (req, res) => {
    const guildId = String(req.body.guild_id || '').trim();
    const action = String(req.body.action || '');
    if (!/^\d{15,25}$/.test(guildId) || !['grant', 'revoke'].includes(action)) {
      req.session.flash = { type: 'err', msg: 'Datos inválidos.' };
      return res.redirect('/admin');
    }
    try {
      if (action === 'grant') {
        await grantAccess(client.db, guildId, req.session.user.id);
        req.session.flash = { type: 'ok', msg: `Servidor ${guildId} aprobado.` };
      } else {
        await revokeAccess(client.db, guildId);
        req.session.flash = { type: 'ok', msg: `Acceso del servidor ${guildId} revocado.` };
      }
    } catch (e) {
      logger.error('dash admin access', { error: e?.message });
      req.session.flash = { type: 'err', msg: 'No se pudo actualizar el acceso.' };
    }
    return res.redirect('/admin');
  });

  return router;
}
