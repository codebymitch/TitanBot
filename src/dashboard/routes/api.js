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
  patchGuildConfig,
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

// '' => null (clear). Otherwise must be a real, non-@everyone role.
function resolveRole(guild, raw) {
  if (raw === undefined || raw === null || raw === '') return { ok: true, id: null };
  const r = guild.roles.cache.get(String(raw));
  if (!r || r.id === guild.id) return { ok: false };
  return { ok: true, id: r.id };
}

function clampInt(raw, min, max, fallback) {
  const n = parseInt(raw, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
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

  router.post('/server/:id/general', async (req, res) => {
    const language = req.body.language === 'en' ? 'en' : 'es';
    const prefix = String(req.body.prefix || '!').trim().slice(0, 5) || '!';
    try {
      await patchGuildConfig(client.db, req.guild.id, { language, prefix });
      flashBack(req, res, 'ok', 'Ajustes generales guardados.');
    } catch (e) {
      logger.error('dash general', { error: e?.message });
      flashBack(req, res, 'err', 'No se pudo guardar.');
    }
  });

  router.post('/server/:id/welcome/save', async (req, res) => {
    const ch = resolveChannel(req.guild, req.body.channel);
    if (!ch.ok) return flashBack(req, res, 'err', 'Canal de bienvenida inválido.');
    const message = String(req.body.message || '').slice(0, 1500);
    try {
      await patchGuildConfig(client.db, req.guild.id, {
        welcome: { channel: ch.id, message },
      });
      flashBack(req, res, 'ok', 'Bienvenida guardada.');
    } catch (e) {
      logger.error('dash welcome save', { error: e?.message });
      flashBack(req, res, 'err', 'No se pudo guardar la bienvenida.');
    }
  });

  router.post('/server/:id/leveling', async (req, res) => {
    const ch = resolveChannel(req.guild, req.body.channel);
    if (!ch.ok) return flashBack(req, res, 'err', 'Canal de niveles inválido.');
    const xpmin = clampInt(req.body.xpmin, 1, 500, 15);
    const xpmax = Math.max(xpmin, clampInt(req.body.xpmax, 1, 500, 25));
    try {
      await patchGuildConfig(client.db, req.guild.id, {
        leveling: {
          enabled: String(req.body.enabled) === '1',
          announceLevelUp: String(req.body.announce) === '1',
          levelUpChannel: ch.id,
          xpPerMessage: { min: xpmin, max: xpmax },
          xpCooldown: clampInt(req.body.cooldown, 0, 3600, 20),
          xpMultiplier: clampInt(req.body.multiplier, 1, 10, 1),
        },
      });
      flashBack(req, res, 'ok', 'Niveles guardado.');
    } catch (e) {
      logger.error('dash leveling', { error: e?.message });
      flashBack(req, res, 'err', 'No se pudo guardar niveles.');
    }
  });

  router.post('/server/:id/birthday', async (req, res) => {
    const ch = resolveChannel(req.guild, req.body.channel);
    const role = resolveRole(req.guild, req.body.role);
    if (!ch.ok) return flashBack(req, res, 'err', 'Canal de cumpleaños inválido.');
    if (!role.ok) return flashBack(req, res, 'err', 'Rol de cumpleaños inválido.');
    try {
      await patchGuildConfig(client.db, req.guild.id, {
        birthdayChannelId: ch.id,
        birthdayRoleId: role.id,
      });
      flashBack(req, res, 'ok', 'Cumpleaños guardado.');
    } catch (e) {
      logger.error('dash birthday', { error: e?.message });
      flashBack(req, res, 'err', 'No se pudo guardar cumpleaños.');
    }
  });

  router.post('/server/:id/moderation', async (req, res) => {
    const mod = resolveRole(req.guild, req.body.modRole);
    const admin = resolveRole(req.guild, req.body.adminRole);
    if (!mod.ok || !admin.ok) return flashBack(req, res, 'err', 'Rol inválido.');
    try {
      await patchGuildConfig(client.db, req.guild.id, {
        modRole: mod.id,
        adminRole: admin.id,
      });
      flashBack(req, res, 'ok', 'Moderación guardada.');
    } catch (e) {
      logger.error('dash moderation', { error: e?.message });
      flashBack(req, res, 'err', 'No se pudo guardar moderación.');
    }
  });

  router.post('/server/:id/autorole', async (req, res) => {
    const role = resolveRole(req.guild, req.body.autoRole);
    if (!role.ok) return flashBack(req, res, 'err', 'Rol inválido.');
    try {
      await patchGuildConfig(client.db, req.guild.id, { autoRole: role.id });
      flashBack(req, res, 'ok', 'Auto-rol guardado.');
    } catch (e) {
      logger.error('dash autorole', { error: e?.message });
      flashBack(req, res, 'err', 'No se pudo guardar auto-rol.');
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
