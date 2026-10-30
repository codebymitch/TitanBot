import { AuditLogEvent } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { getGuildConfig, updateGuildConfig } from '../config/guildConfig.js';
import { isTrusted } from '../../utils/antiNukeLogging.js';
import { isBotOwner } from '../../config/bot.js';

// Hard bans (from `هارد بان` / massban) can only be lifted by trusted members.
// Any other unban is reverted immediately, and a hard-banned user who rejoins is banned again.
const CONFIG_KEY = 'hardBannedUsers';
const REBAN_REASON = 'Hard ban: only trusted members can lift this ban';

async function readHardBans(client, guildId) {
  const config = await getGuildConfig(client, guildId);
  return new Set(Array.isArray(config?.[CONFIG_KEY]) ? config[CONFIG_KEY] : []);
}

export async function isHardBanned(client, guildId, userId) {
  return (await readHardBans(client, guildId)).has(userId);
}

export async function addHardBans(client, guildId, userIds) {
  if (!userIds.length) return;
  const hardBans = await readHardBans(client, guildId);
  userIds.forEach((id) => hardBans.add(id));
  await updateGuildConfig(client, guildId, { [CONFIG_KEY]: [...hardBans] });
}

export async function removeHardBan(client, guildId, userId) {
  const hardBans = await readHardBans(client, guildId);
  if (!hardBans.delete(userId)) return;
  await updateGuildConfig(client, guildId, { [CONFIG_KEY]: [...hardBans] });
}

/** Trusted = server owner, bot owner, the bot itself, or anti-nuke trusted users/roles. */
export async function canLiftHardBan(guild, userId) {
  if (isBotOwner(userId)) return true;
  const config = await getGuildConfig(guild.client, guild.id).catch(() => null);
  return isTrusted(guild, config, userId);
}

async function findUnbanExecutor(guild, userId) {
  const logs = await guild.fetchAuditLogs({ type: AuditLogEvent.MemberBanRemove, limit: 6 }).catch(() => null);
  const entry = logs?.entries.find((item) => item.target?.id === userId && Date.now() - item.createdTimestamp < 30_000);
  return entry?.executor?.id || null;
}

/** GuildBanRemove: undo the unban unless a trusted member lifted it. */
export async function enforceHardBanOnUnban(ban) {
  const { guild, user } = ban;
  if (!(await isHardBanned(guild.client, guild.id, user.id))) return;

  const executorId = await findUnbanExecutor(guild, user.id);
  if (executorId && executorId !== guild.client.user.id && await canLiftHardBan(guild, executorId)) {
    await removeHardBan(guild.client, guild.id, user.id);
    logger.info(`Hard ban on ${user.id} lifted by trusted member ${executorId} in ${guild.id}`);
    return;
  }

  await guild.members.ban(user.id, { reason: REBAN_REASON }).catch((error) => {
    logger.error(`Failed to re-apply hard ban on ${user.id} in ${guild.id}:`, error);
  });
  logger.warn(`Reverted unban of hard-banned user ${user.id} by ${executorId || 'unknown'} in ${guild.id}`);
}

/** GuildMemberAdd: a hard-banned user who got back in (e.g. unbanned while the bot was offline) is banned again. */
export async function enforceHardBanOnJoin(member) {
  if (!(await isHardBanned(member.client, member.guild.id, member.id))) return;
  await member.guild.members.ban(member.id, { reason: REBAN_REASON }).catch((error) => {
    logger.error(`Failed to re-apply hard ban on ${member.id} in ${member.guild.id}:`, error);
  });
}
