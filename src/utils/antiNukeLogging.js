import { AuditLogEvent, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { logger } from './logger.js';
import { getGuildConfig } from '../services/config/guildConfig.js';
import { isServerOwner } from '../config/serverOwners.js';

const TEN_SECONDS = 10_000;
const ONE_MINUTE = 60_000;
// Role pinged by the red anti-nuke alert (instead of @everyone).
const ALERT_ROLE_ID = '1155237751109730435';
const counters = new Map();
const seenEntries = new Map();
// threshold = actions within windowMs that trigger stripping permissions; threshold + 2 triggers a ban.
const ACTIONS = Object.freeze({
  channelDelete: { audit: AuditLogEvent.ChannelDelete, threshold: 1, windowMs: TEN_SECONDS },
  roleDelete: { audit: AuditLogEvent.RoleDelete, threshold: 2, windowMs: TEN_SECONDS },
  memberBan: { audit: AuditLogEvent.MemberBanAdd, threshold: 5, windowMs: TEN_SECONDS },
  memberKick: { audit: AuditLogEvent.MemberKick, threshold: 5, windowMs: TEN_SECONDS },
  bulkDelete: { audit: AuditLogEvent.MessageBulkDelete, threshold: 10, windowMs: ONE_MINUTE },
  permissionUpdate: { audit: [AuditLogEvent.RoleUpdate, AuditLogEvent.ChannelOverwriteUpdate], threshold: 2, windowMs: ONE_MINUTE },
  roleCreate: { audit: AuditLogEvent.RoleCreate, threshold: 3, windowMs: TEN_SECONDS },
});

async function getEntry(guild, auditType, targetId, filter = () => true) {
  for (const type of (Array.isArray(auditType) ? auditType : [auditType])) {
    const logs = await guild.fetchAuditLogs({ type, limit: 6 }).catch(() => null);
    const entry = logs?.entries.find((item) => (!targetId || item.target?.id === targetId) && Date.now() - item.createdTimestamp < 15_000 && filter(item));
    if (entry) return entry;
  }
  return null;
}

// The same audit entry can surface through several gateway events; count it once.
function alreadySeen(entryId) {
  const now = Date.now();
  for (const [id, time] of seenEntries) if (now - time > ONE_MINUTE) seenEntries.delete(id);
  if (seenEntries.has(entryId)) return true;
  seenEntries.set(entryId, now);
  return false;
}

function record(guildId, executorId, action, windowMs) {
  const id = `${guildId}:${executorId}:${action}`;
  const now = Date.now();
  const history = (counters.get(id) || []).filter((time) => now - time < windowMs);
  history.push(now);
  counters.set(id, history);
  return history.length;
}

export async function isTrusted(guild, config, executorId) {
  if (executorId === guild.ownerId || executorId === guild.client.user?.id) return true;
  // The server owners (config/serverOwners.js) are never treated as an attack, whoever Discord lists as owner.
  if (isServerOwner(executorId)) return true;
  if (config?.antiNukeTrustedUsers?.includes(executorId)) return true;
  const trustedRoles = new Set(config?.antiNukeTrustedRoles || []);
  if (!trustedRoles.size) return false;
  const member = await guild.members.fetch(executorId).catch(() => null);
  return Boolean(member?.roles?.cache?.some((role) => trustedRoles.has(role.id)));
}

// Takes the member's dangerous roles off them. The roles themselves are never edited, so everyone else
// who holds them keeps their permissions.
async function removeDangerousRoles(member) {
  if (!member?.manageable) return false;
  const dangerous = [PermissionFlagsBits.Administrator, PermissionFlagsBits.ManageGuild, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageRoles, PermissionFlagsBits.BanMembers, PermissionFlagsBits.KickMembers];
  const roles = member.roles.cache.filter((role) => role.editable && !role.managed && role.id !== member.guild.id && role.permissions.any(dangerous));
  if (!roles.size) return false;
  return member.roles.remove([...roles.keys()], 'Anti-Nuke: excessive destructive activity').then(() => true).catch(() => false);
}

const ACTION_LABELS = Object.freeze({
  channelDelete: 'مسح روم',
  roleDelete: 'مسح رتبة',
  memberBan: 'باند أعضاء',
  memberKick: 'طرد أعضاء',
  bulkDelete: 'مسح رسائل جماعي',
  permissionUpdate: 'تعديل صلاحيات',
  roleCreate: 'إنشاء رتب',
});

async function send(guild, payload) {
  const config = await getGuildConfig(guild.client, guild.id).catch(() => null);
  const channel = config?.antiNukeLogChannelId ? guild.channels.cache.get(config.antiNukeLogChannelId) : null;
  if (!channel?.isTextBased?.()) return;
  await channel.send(payload).catch(() => {});
}

const time = () => `<t:${Math.floor(Date.now() / 1000)}:F>`;

// Suspicious activity below the limit: yellow warning, no ping.
function warn(guild, executorId, action, count, threshold) {
  const embed = new EmbedBuilder().setColor(0xfee75c).setTitle('⚠️ نشاط مشبوه')
    .setDescription(`**العضو:** <@${executorId}>\n**الفعل:** ${ACTION_LABELS[action] || action} (${count}/${threshold})\n**الوقت:** ${time()}`);
  return send(guild, { embeds: [embed], allowedMentions: { parse: [] } });
}

// Sent only after the member has already been dealt with: red, pings the alert role.
function alert(guild, executorId, punishment, reason) {
  const embed = new EmbedBuilder().setColor(0xed4245).setTitle(`🚨 ${punishment}`)
    .setDescription(`**العضو:** <@${executorId}>\n**السبب:** ${reason}\n**الوقت:** ${time()}`);
  return send(guild, { content: `<@&${ALERT_ROLE_ID}>`, embeds: [embed], allowedMentions: { roles: [ALERT_ROLE_ID] } });
}

async function punish(member, reason) {
  if (member?.kickable && await member.kick(reason).then(() => true).catch(() => false)) return 'تم طرده';
  if (await removeDangerousRoles(member)) return 'تم سحب رتبه الخطيرة (لم يمكن طرده)';
  return 'فشل التعامل معه — يحتاج تدخل يدوي';
}

export async function inspectAuditAction(guild, action, targetId = null, filter) {
  const rule = ACTIONS[action];
  if (!guild || !rule) return false;
  const entry = await getEntry(guild, rule.audit, targetId, filter);
  if (!entry?.executor?.id || alreadySeen(entry.id)) return false;
  const config = await getGuildConfig(guild.client, guild.id).catch(() => null);
  if (await isTrusted(guild, config, entry.executor.id)) return false;
  const count = record(guild.id, entry.executor.id, action, rule.windowMs);
  if (count < rule.threshold) {
    await warn(guild, entry.executor.id, action, count, rule.threshold);
    return false;
  }
  const reason = `${ACTION_LABELS[action] || action}: ${count} مرات خلال ${rule.windowMs / 1000} ثانية`;
  const executor = await guild.members.fetch(entry.executor.id).catch(() => null);
  const punishment = await punish(executor, `Anti-Nuke: ${reason}`);
  await alert(guild, entry.executor.id, punishment, reason);
  return true;
}

export async function findRecentAuditEntry(guild, auditType, targetId, filter) { return getEntry(guild, auditType, targetId, filter); }
export async function sendAntiNukeLog(guild, data) {
  logger.warn(`[Anti-Nuke] ${data.action}: ${data.target || 'unknown'}`);
  await alert(guild, data.executor?.id, data.punishment || 'تم طرده', data.reason || data.action);
}
export { AuditLogEvent };
