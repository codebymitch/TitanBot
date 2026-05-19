import { botConfig } from '../config/bot.js';
import { logger } from '../utils/logger.js';

const ACCESS_KEY = 'bot:access';

/**
 * Subscription / allowlist gate.
 *
 * Anyone can add the bot, but it only works in guilds the bot owner
 * has approved. Approval is permanent until revoked. State lives in a
 * single DB document so it is easy to list/manage.
 *
 *   bot:access -> { guilds: { "<guildId>": { by, at } } }
 */

export function getOwnerIds() {
  const fromConfig = botConfig.commands?.owners || [];
  const fromEnv = (process.env.OWNER_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return [...new Set([...fromConfig, ...fromEnv])];
}

export function isOwner(userId) {
  if (!userId) return false;
  return getOwnerIds().includes(String(userId));
}

async function readDoc(db) {
  if (!db || typeof db.get !== 'function') return { guilds: {} };
  const doc = await db.get(ACCESS_KEY, null);
  if (!doc || typeof doc !== 'object' || typeof doc.guilds !== 'object') {
    return { guilds: {} };
  }
  return doc;
}

export async function isGuildApproved(db, guildId) {
  if (!guildId) return false;
  try {
    const doc = await readDoc(db);
    return Boolean(doc.guilds[String(guildId)]);
  } catch (err) {
    // Fail OPEN would defeat the gate; fail CLOSED but log it.
    logger.error('accessService.isGuildApproved failed', { error: err?.message, guildId });
    return false;
  }
}

export async function grantAccess(db, guildId, byUserId) {
  const doc = await readDoc(db);
  doc.guilds[String(guildId)] = {
    by: String(byUserId || 'unknown'),
    at: new Date().toISOString(),
  };
  await db.set(ACCESS_KEY, doc);
  return true;
}

export async function revokeAccess(db, guildId) {
  const doc = await readDoc(db);
  const key = String(guildId);
  if (!doc.guilds[key]) return false;
  delete doc.guilds[key];
  await db.set(ACCESS_KEY, doc);
  return true;
}

export async function listAccess(db) {
  const doc = await readDoc(db);
  return Object.entries(doc.guilds).map(([guildId, meta]) => ({
    guildId,
    by: meta?.by || 'unknown',
    at: meta?.at || null,
  }));
}
