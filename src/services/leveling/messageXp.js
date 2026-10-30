import { logger } from '../../utils/logger.js';
import { checkRateLimit } from '../../utils/rateLimiter.js';
import { getLevelingConfig, getUserLevelData } from './leveling.js';
import { addXp } from './xpSystem.js';

// Chat XP: a random amount per message, at most once per cooldown per member. Ignored channels, roles
// and blacklisted members get nothing. The level-up message is sent by xpSystem.
const RATE_LIMIT_ATTEMPTS = 12;
const RATE_LIMIT_WINDOW_MS = 10_000;
const DEFAULT_COOLDOWN_S = 60;

export function rollXp(config, random = Math.random) {
  const range = config.xpRange || config.xpPerMessage || {};
  const min = Math.max(1, range.min || 15);
  const max = Math.max(min, range.max || 25);
  const xp = Math.floor(random() * (max - min + 1)) + min;
  return config.xpMultiplier > 1 ? Math.floor(xp * config.xpMultiplier) : xp;
}

export async function handleMessageXp(message, client) {
  try {
    if (!message.member) return;
    const canProcess = await checkRateLimit(`xp-event:${message.guild.id}:${message.author.id}`, RATE_LIMIT_ATTEMPTS, RATE_LIMIT_WINDOW_MS);
    if (!canProcess) return;

    const config = await getLevelingConfig(client, message.guild.id);
    if (!config?.enabled) return;
    if (config.ignoredChannels?.includes(message.channel.id)) return;
    if (config.blacklistedUsers?.includes(message.author.id)) return;
    if (config.ignoredRoles?.some((roleId) => message.member.roles.cache.has(roleId))) return;

    const userData = await getUserLevelData(client, message.guild.id, message.author.id);
    const cooldownMs = (config.xpCooldown || DEFAULT_COOLDOWN_S) * 1000;
    if (Date.now() - (userData.lastMessage || 0) < cooldownMs) return;

    await addXp(client, message.guild, message.member, rollXp(config));
  } catch (error) {
    logger.error('Error handling leveling for message:', error);
  }
}
