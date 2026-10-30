import { PermissionFlagsBits } from 'discord.js';
import { getCommandPrefix } from '../config/bot.js';
import { isServerOwner } from '../config/serverOwners.js';
import { getGuildConfig, updateGuildConfig } from '../services/config/guildConfig.js';
import { ModerationService } from '../services/moderation/moderationService.js';
import { WarningService } from '../services/moderation/warningService.js';
import { scheduleNoPermissionDelete } from './noPermissionReply.js';
import { handlePurgeMessage } from '../services/moderation/channelPurgeService.js';
import { refreshTrustedBoard } from '../services/trustedBoardService.js';
import { issueWarning, warningCard } from '../services/moderation/warnEscalation.js';
import { moderationCard, cardReason, formatDurationMs, NO_REASON } from './moderationCard.js';
import { unbanDmLine } from '../services/moderation/punishmentDm.js';

const COMMANDS = new Set([
  'وارن', 'وارنات', 'تايم', 'انتايم', 'بان', 'انبان', 'كلير', 'ان', 'شيل', 'ر', 'رول', 'ب', 'رتبة', 'ازالةرتبة', 'purge', 'تراست', 'انتراست', 'trusted', 'trustedlist', 'warn', 'warnings', 'timeout', 'untimeout', 'ban', 'unban', 'clear', 'remove', 'role', 'roll', 'lock', 'unlock',
].map((value) => value.toLowerCase()));
const ADD_ROLE_COMMANDS = new Set(['ر', 'رول', 'ان', 'رتبة', 'role', 'roll', 'addrole']);
const REMOVE_ROLE_COMMANDS = new Set(['ب', 'شيل', 'ازالةرتبة', 'remove', 'unrole', 'removerole']);
const MAX_TIMEOUT_MS = 28 * 24 * 60 * 60 * 1000;

function parseDuration(value) {
  const match = String(value || '').trim().toLowerCase().match(/^(\d+)\s*(s|m|h|d|w)$/);
  if (!match) return null;
  const multipliers = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000 };
  const durationMs = Number(match[1]) * multipliers[match[2]];
  return durationMs > 0 && durationMs <= MAX_TIMEOUT_MS ? durationMs : null;
}

function stripPrefix(content, prefixes) {
  const value = String(content || '').trim();
  const prefix = prefixes.filter(Boolean).sort((a, b) => b.length - a.length)
    .find(candidate => value.toLowerCase().startsWith(candidate.toLowerCase()));
  return prefix ? value.slice(prefix.length).trim() : value;
}

function tokenize(content, prefixes = []) {
  const value = stripPrefix(content, prefixes);
  const parts = value.split(/\s+/u).filter(Boolean);
  if (!parts.length) return null;
  let command = parts[0].toLowerCase();
  let body = parts.slice(1).join(' ');
  if (!COMMANDS.has(command)) {
    const last = parts.at(-1)?.toLowerCase();
    if (!COMMANDS.has(last)) return null;
    command = last;
    body = parts.slice(0, -1).join(' ');
  }
  const mention = body.match(/<@!?(\d+)>/u);
  const id = body.match(/(?:^|\s)(\d{17,20})(?:\s|$)/u);
  const targetId = mention?.[1] || id?.[1] || null;
  const tail = body.replace(/<@!?\d+>/u, '').replace(/(?:^|\s)\d{17,20}(?=\s|$)/u, '').trim();
  return { command, targetId, tail };
}

function roleFor(guild, roleName) {
  const normalized = roleName.trim().toLowerCase();
  if (!normalized) return null;
  const roles = guild.roles.cache.filter(role => !role.managed && role.id !== guild.id);
  return roles.find(role => role.name.toLowerCase() === normalized)
    || roles.find(role => role.name.toLowerCase().startsWith(normalized))
    || roles.find(role => role.name.toLowerCase().includes(normalized));
}

function hasPermission(member, permission) {
  return member.permissions.has(permission) || member.guild.ownerId === member.id;
}

async function reply(message, content) {
  await message.channel.send({ content, allowedMentions: { parse: [] } }).then(scheduleNoPermissionDelete).catch(() => {});
}

async function sendCard(message, card) {
  await message.channel.send(moderationCard(card)).catch(() => {});
  return true;
}

async function getReplyTargetId(message) {
  if (!message.reference?.messageId) return null;
  const referencedMessage = await message.fetchReference().catch(() => null);
  return referencedMessage?.author?.bot ? null : referencedMessage?.author?.id || null;
}

async function handleTrustedList(message) {
  if (!isServerOwner(message.author.id)) return reply(message, '❌ أمر Trust متاح للمالك فقط.');
  const config = await getGuildConfig(message.client, message.guild.id);
  const trustedUserIds = Array.isArray(config?.antiNukeTrustedUsers) ? config.antiNukeTrustedUsers : [];
  const trustedRoleIds = Array.isArray(config?.antiNukeTrustedRoles) ? config.antiNukeTrustedRoles : [];
  const users = [];
  const bots = [];
  for (const userId of [...new Set(trustedUserIds)]) {
    const member = await message.guild.members.fetch(userId).catch(() => null);
    const user = member?.user || await message.client.users.fetch(userId).catch(() => null);
    const mention = `<@${userId}>`;
    if (user?.bot || member?.user?.bot) bots.push(`${mention} (${user?.tag || user?.username || userId})`);
    else users.push(`${mention} (${user?.tag || user?.username || userId})`);
  }
  const roles = [];
  for (const roleId of [...new Set(trustedRoleIds)]) {
    const role = await message.guild.roles.fetch(roleId).catch(() => null);
    roles.push(role ? `${role} (${role.name})` : `<@&${roleId}> (رتبة غير موجودة)`);
  }
  return reply(message, ['🛡️ **قائمة Trusted في هذا السيرفر**', '', `**الأعضاء (${users.length}):**`, users.length ? users.join('\n') : 'لا يوجد', '', `**البوتات (${bots.length}):**`, bots.length ? bots.join('\n') : 'لا يوجد', '', `**الرتب (${roles.length}):**`, roles.length ? roles.join('\n') : 'لا يوجد'].join('\n'));
}

async function handleTrust(message, targetId) {
  if (!isServerOwner(message.author.id)) return reply(message, '❌ أمر Trust متاح للمالك فقط.');
  const resolvedTargetId = targetId || await getReplyTargetId(message);
  if (!resolvedTargetId) return true;
  const member = await message.guild.members.fetch(resolvedTargetId).catch(() => null);
  if (!member) return reply(message, '❌ Member Not Found');
  const config = await getGuildConfig(message.client, message.guild.id);
  const trustedUsers = new Set(Array.isArray(config?.antiNukeTrustedUsers) ? config.antiNukeTrustedUsers : []);
  const alreadyTrusted = trustedUsers.has(member.id);
  trustedUsers.add(member.id);
  await updateGuildConfig(message.client, message.guild.id, { antiNukeTrustedUsers: [...trustedUsers] });
  if (!alreadyTrusted) await refreshTrustedBoard(message.client, message.guild.id);
  return reply(message, alreadyTrusted ? `ℹ️ ${member} محمي بالفعل من نظام Anti-Raid.` : `🛡️ تم إعطاء ${member} حماية من نظام Anti-Raid.`);
}

async function lockChannel(message) {
  if (!hasPermission(message.member, PermissionFlagsBits.ManageChannels)) return reply(message, '❌ ليس لديك صلاحية إدارة الرومات.');
  if (!message.channel?.permissionOverwrites?.edit) return reply(message, '❌ هذا الأمر يعمل داخل روم قابلة للقفل فقط.');
  const everyoneRole = message.guild.roles.everyone;
  if (message.channel.permissionsFor(everyoneRole)?.has(PermissionFlagsBits.SendMessages) === false) return reply(message, '⚠️ الروم مقفولة بالفعل.');
  await message.channel.permissionOverwrites.edit(everyoneRole, { SendMessages: false }, { reason: `Channel locked by ${message.author.tag}` });
  return sendCard(message, { emoji: '🔒', title: 'CHANNEL LOCKED', fields: [['Channel', `${message.channel}`]], moderatorId: message.author.id });
}

async function changeRole(message, targetMember, roleName, add) {
  if (!hasPermission(message.member, PermissionFlagsBits.ManageRoles)) return reply(message, '🚫 No Permission');
  if (!targetMember || !roleName) return true;
  const role = roleFor(message.guild, roleName);
  const botRole = message.guild.members.me?.roles.highest;
  const actor = message.member;
  if (!role) return reply(message, `❌ Role ${roleName} Not Found`);
  if (role.managed || !botRole || role.position >= botRole.position) return reply(message, '❌ Role Is Higher Than Mine');
  if (role.position >= actor.roles.highest.position && message.guild.ownerId !== actor.id) return reply(message, '❌ Role Is Higher Than Yours');
  if (add) {
    await targetMember.roles.add(role, `Role shortcut by ${message.author.tag}`);
    return sendCard(message, { emoji: '✅', title: 'ROLE ADDED', fields: [['User', `<@${targetMember.id}>`], ['Role', `${role}`]], moderatorId: message.author.id });
  }
  await targetMember.roles.remove(role, `Role shortcut by ${message.author.tag}`);
  return sendCard(message, { emoji: '➖', title: 'ROLE REMOVED', fields: [['User', `<@${targetMember.id}>`], ['Role', `${role}`]], moderatorId: message.author.id });
}

async function listWarnings(message, targetMember, guildId) {
  if (!hasPermission(message.member, PermissionFlagsBits.ModerateMembers)) return reply(message, '🚫 No Permission');
  if (!targetMember) return true;
  const warnings = (await WarningService.getWarnings(guildId, targetMember.id))
    .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
  if (!warnings.length) return reply(message, `📋 لا توجد تحذيرات على <@${targetMember.id}>.`);

  const lines = [`📋 **Warnings for <@${targetMember.id}>**`, ''];
  for (const [index, warning] of warnings.entries()) {
    const moderator = await message.guild.members.fetch(warning.moderatorId).catch(() => null);
    const timestamp = Math.floor((warning.timestamp || Date.now()) / 1000);
    lines.push(`**${index + 1}.** <t:${timestamp}:f> — ${warning.reason || NO_REASON} — بواسطة ${moderator ? `<@${moderator.id}>` : `<@${warning.moderatorId}>`}`);
  }

  let chunk = '';
  for (const line of lines) {
    if ((chunk + line + '\n').length > 1900) {
      await reply(message, chunk);
      chunk = '';
    }
    chunk += `${line}\n`;
  }
  if (chunk.trim()) await reply(message, chunk);
  return true;
}

const ARABIC_ADD_ROLE_COMMANDS = new Set(['ر', 'رول', 'ان', 'رتبة']);
const ARABIC_REMOVE_ROLE_COMMANDS = new Set(['ب', 'شيل', 'ازالةرتبة']);

/**
 * Arabic role shortcuts (`ر @member role` / `ب @member role`), with or without the prefix.
 * Only Arabic names are handled here so English words such as `roll` keep their normal commands.
 */
export async function handleArabicRoleShortcut(message, prefixes = []) {
  const parts = stripPrefix(message.content, prefixes).split(/\s+/u).filter(Boolean);
  const command = parts[0]?.toLowerCase();
  const add = ARABIC_ADD_ROLE_COMMANDS.has(command);
  if (!add && !ARABIC_REMOVE_ROLE_COMMANDS.has(command)) return false;

  const body = parts.slice(1).join(' ');
  const mention = body.match(/<@!?(\d+)>/u);
  const id = body.match(/(?:^|\s)(\d{17,20})(?:\s|$)/u);
  const targetId = mention?.[1] || id?.[1] || await getReplyTargetId(message);
  const roleName = body.replace(/<@!?\d+>/u, '').replace(/(?:^|\s)\d{17,20}(?=\s|$)/u, '').trim();
  // `ان` is also a very common Arabic word ("ان شاء الله"), so it only reacts when a member is given.
  if (!targetId && command === 'ان') return false;
  if (!hasPermission(message.member, PermissionFlagsBits.ManageRoles)) {
    await reply(message, '🚫 No Permission');
    return true;
  }
  if (!targetId || !roleName) {
    await reply(message, `⚠️ ${command} @user role`);
    return true;
  }

  const targetMember = await message.guild.members.fetch(targetId).catch(() => null);
  if (!targetMember) return reply(message, '❌ Member Not Found');
  try {
    await changeRole(message, targetMember, roleName, add);
  } catch (error) {
    await reply(message, `❌ ${error.userMessage || error.message || 'حدث خطأ أثناء تنفيذ الأمر.'}`);
  }
  return true;
}

/** `مسح تحذيرات @member` (or as a reply) — clears all of a member's warnings. */
export async function handleClearWarningsShortcut(message, args) {
  if (!hasPermission(message.member, PermissionFlagsBits.ModerateMembers)) return reply(message, '🚫 No Permission');
  const body = args.join(' ');
  const mention = body.match(/<@!?(\d+)>/u);
  const id = body.match(/(?:^|\s)(\d{17,20})(?:\s|$)/u);
  const targetId = mention?.[1] || id?.[1] || await getReplyTargetId(message);
  if (!targetId) return reply(message, '⚠️ مسح تحذيرات @user');
  const targetMember = await message.guild.members.fetch(targetId).catch(() => null);
  if (!targetMember) return reply(message, '❌ Member Not Found');
  try {
    ModerationService.assertModerationHierarchy(message.member, targetMember, 'warn');
    const result = await WarningService.clearWarnings(message.guild.id, targetId);
    return sendCard(message, { emoji: '🧹', title: 'WARNINGS CLEARED', fields: [['User', `<@${targetId}>`], ['Removed', `${result.count}`]], moderatorId: message.author.id });
  } catch (error) {
    return reply(message, `❌ ${error.userMessage || error.message || 'حدث خطأ أثناء تنفيذ الأمر.'}`);
  }
}

export async function handleArabicModerationShortcut(message) {
  const guildConfig = await getGuildConfig(message.client, message.guild.id).catch(() => null);
  const parsed = tokenize(message.content, [guildConfig?.prefix, getCommandPrefix()]);
  if (!parsed) return false;
  if (parsed.command === 'purge') return handlePurgeMessage(message);
  if (parsed.command === 'ق') return lockChannel(message);

  const { command } = parsed;
  const targetId = parsed.targetId || await getReplyTargetId(message);
  if (!targetId) return true;
  const tail = parsed.tail;
  const guild = message.guild;
  const targetMember = await guild.members.fetch(targetId).catch(() => null);
  const targetUser = targetMember?.user || await message.client.users.fetch(targetId).catch(() => null);

  try {
    if (command === 'وارنات' || command === 'warnings') return listWarnings(message, targetMember, guild.id);
    if (ADD_ROLE_COMMANDS.has(command) || REMOVE_ROLE_COMMANDS.has(command)) return changeRole(message, targetMember, tail, ADD_ROLE_COMMANDS.has(command));

    if (command === 'وارن' || command === 'warn') {
      if (!hasPermission(message.member, PermissionFlagsBits.ModerateMembers)) return reply(message, '🚫 No Permission');
      if (!targetMember) return true;
      ModerationService.assertModerationHierarchy(message.member, targetMember, 'warn');
      const result = await issueWarning({ guild, member: targetMember, moderator: message.member, reason: tail });
      await message.channel.send(warningCard({ userId: targetId, moderatorId: message.member.id, result })).catch(() => {});
      return true;
    }

    if (command === 'تايم' || command === 'timeout') {
      if (!hasPermission(message.member, PermissionFlagsBits.ModerateMembers)) return reply(message, '🚫 No Permission');
      if (!targetMember) return true;
      const [durationText, ...reasonParts] = tail.split(/\s+/u);
      const durationMs = parseDuration(durationText);
      const reason = reasonParts.join(' ') || NO_REASON;
      if (!durationMs) return reply(message, '❌ اكتب المدة هكذا: `تايم 5m السبب`.');
      ModerationService.assertModerationHierarchy(message.member, targetMember, 'timeout');
      await ModerationService.timeoutUser({ guild, member: targetMember, moderator: message.member, durationMs, reason });
      return sendCard(message, {
        emoji: '⏳',
        title: 'TIMEOUT ISSUED',
        fields: [['User', `<@${targetId}>`], ['Reason', cardReason(reason)], ['Duration', `${formatDurationMs(durationMs)} (ends <t:${Math.floor((Date.now() + durationMs) / 1000)}:R>)`]],
        moderatorId: message.member.id,
      });
    }

    if (command === 'انتايم' || command === 'untimeout') {
      if (!hasPermission(message.member, PermissionFlagsBits.ModerateMembers)) return reply(message, '🚫 No Permission');
      if (!targetMember) return true;
      await ModerationService.removeTimeoutUser({ guild, member: targetMember, moderator: message.member, reason: tail || NO_REASON });
      return sendCard(message, { emoji: '🔓', title: 'TIMEOUT REMOVED', fields: [['User', `<@${targetId}>`], ['Reason', cardReason(tail)]], moderatorId: message.member.id });
    }

    if (command === 'بان' || command === 'ban') {
      if (!hasPermission(message.member, PermissionFlagsBits.BanMembers)) return reply(message, '🚫 No Permission');
      if (!targetUser) return true;
      await ModerationService.banUser({ guild, user: targetUser, moderator: message.member, reason: tail || NO_REASON });
      return sendCard(message, { emoji: '🔨', title: 'BAN ISSUED', fields: [['User', `<@${targetId}>`], ['Reason', cardReason(tail)]], moderatorId: message.member.id });
    }

    if (command === 'انبان' || command === 'unban') {
      if (!hasPermission(message.member, PermissionFlagsBits.BanMembers)) return reply(message, '🚫 No Permission');
      if (!targetUser) return true;
      const result = await ModerationService.unbanUser({ guild, user: targetUser, moderator: message.member, reason: tail || NO_REASON });
      return sendCard(message, { emoji: '✅', title: 'BAN REMOVED', fields: [['User', `<@${targetId}>`], ['Reason', cardReason(tail)], ['DM', unbanDmLine(result.dmSent)]], moderatorId: message.member.id });
    }

    if (command === 'كلير' || command === 'clear') {
      if (!hasPermission(message.member, PermissionFlagsBits.ModerateMembers)) return reply(message, '🚫 No Permission');
      if (!targetMember) return true;
      const result = await WarningService.clearWarnings(guild.id, targetId);
      return sendCard(message, { emoji: '🧹', title: 'WARNINGS CLEARED', fields: [['User', `<@${targetId}>`], ['Reason', cardReason(tail)], ['Removed', `${result.count}`]], moderatorId: message.member.id });
    }
  } catch (error) {
    await reply(message, `❌ ${error.userMessage || error.message || 'حدث خطأ أثناء تنفيذ الأمر.'}`);
  }
  return true;
}
