// dangerList.js — `خطر @member` (reports #218, #219), our server only.
//
// An owner or a trusted member (the Anti-Nuke trusted list) puts a member on the danger list:
//   • `خطر @member` (or `خطر ID`, or `خطر` as a reply to their message) adds them;
//   • `خطر شيل @member` removes them;
//   • `خطر` alone shows the list.
// Adding someone also takes their admin roles off (staff roles and roles with a dangerous permission,
// as in rejoinRestore.js); `خطر شيل` gives them back. Adding or removing posts a notice in the trusted
// channel and updates the danger board there (under the trusted board). Anything dangerous a listed member does gives them a one-week timeout, and the bot writes
// what happened in the Anti-Nuke log: a dangerous audit-log action (ban, kick, channels, roles, webhooks,
// bots, server settings, timing someone out…), @everyone/@here or an invite link, an insult or spam caught
// by the filters, or a dangerous moderation command run through the bot. The owners are never punished.

import { AuditLogEvent } from 'discord.js';
import { isHomeGuild } from '../../config/homeGuild.js';
import { isServerOwner } from '../../config/serverOwners.js';
import { getGuildConfig } from '../config/guildConfig.js';
import { TRUSTED_BOARD_CHANNEL_ID } from '../trustedBoardService.js';
import { isTrusted } from '../../utils/antiNukeLogging.js';
import { findBoardMessage, rememberBoardMessage } from '../../utils/boardMessage.js';
import { staffAndDangerousRoles } from './rejoinRestore.js';
import { logger } from '../../utils/logger.js';

export const DANGER_NOTICE_CHANNEL_ID = TRUSTED_BOARD_CHANNEL_ID;
export const DANGER_LOG_CHANNEL_ID = '1550564287129456810';
export const DANGER_TIMEOUT_MS = 7 * 24 * 60 * 60 * 1000;
export const DANGER_COMMAND_WORD = 'خطر';
const REMOVE_WORDS = new Set(['شيل', 'امسح', 'مسح', 'remove']);
const BOARD_KEY = 'danger';
const BOARD_TITLE = '☢️ قائمة الخطر';
// Several audit entries can come from one attack; one timeout and one log line are enough.
const PUNISH_COOLDOWN_MS = 60_000;

/** Audit-log actions that count as dangerous, with how they are named in the log. */
export const DANGER_AUDIT_ACTIONS = new Map([
  [AuditLogEvent.MemberBanAdd, 'إدّى بان لعضو'],
  [AuditLogEvent.MemberBanRemove, 'فك بان عضو'],
  [AuditLogEvent.MemberKick, 'طرد عضو'],
  [AuditLogEvent.MemberPrune, 'عمل Prune للأعضاء'],
  [AuditLogEvent.MemberRoleUpdate, 'غيّر رولات عضو'],
  [AuditLogEvent.ChannelCreate, 'عمل روم'],
  [AuditLogEvent.ChannelDelete, 'مسح روم'],
  [AuditLogEvent.ChannelUpdate, 'عدّل روم'],
  [AuditLogEvent.ChannelOverwriteCreate, 'عدّل صلاحيات روم'],
  [AuditLogEvent.ChannelOverwriteUpdate, 'عدّل صلاحيات روم'],
  [AuditLogEvent.ChannelOverwriteDelete, 'عدّل صلاحيات روم'],
  [AuditLogEvent.RoleCreate, 'عمل رول'],
  [AuditLogEvent.RoleDelete, 'مسح رول'],
  [AuditLogEvent.RoleUpdate, 'عدّل رول'],
  [AuditLogEvent.WebhookCreate, 'عمل ويبهوك'],
  [AuditLogEvent.WebhookUpdate, 'عدّل ويبهوك'],
  [AuditLogEvent.WebhookDelete, 'مسح ويبهوك'],
  [AuditLogEvent.MessageBulkDelete, 'مسح رسايل بالجملة'],
  [AuditLogEvent.BotAdd, 'دخّل بوت'],
  [AuditLogEvent.GuildUpdate, 'عدّل إعدادات السيرفر'],
  [AuditLogEvent.EmojiDelete, 'مسح إيموجي'],
  [AuditLogEvent.StickerDelete, 'مسح ستيكر'],
  [AuditLogEvent.IntegrationCreate, 'ضاف Integration'],
]);

/** Bot commands a listed member may not run: they are blocked and count as dangerous. */
export const DANGER_COMMANDS = new Set(['ban', 'unban', 'massban', 'kick', 'masskick', 'timeout', 'purge', 'clear', 'lock']);

const EVERYONE = /@(?:everyone|here)\b/iu;
const INVITE_LINK = /(?:discord(?:app)?\.com\/invite|discord\.gg)\/[\w-]+/iu;
const USER_ARG = /^<@!?(\d{17,20})>$|^(\d{17,20})$/u;

const recordKey = (guildId) => `guild:${guildId}:dangerList`;
// Read once per database and server: messages check the list on every message.
const cache = new WeakMap();
const lastPunished = new Map();

function cacheFor(db) {
  if (!cache.has(db)) cache.set(db, new Map());
  return cache.get(db);
}

/** The danger list of a server: [{ userId, addedBy, addedAt }]. */
export async function getDangerList(client, guildId) {
  const byGuild = cacheFor(client.db);
  if (!byGuild.has(guildId)) {
    const stored = await client.db.get(recordKey(guildId), []).catch(() => []);
    byGuild.set(guildId, Array.isArray(stored) ? stored : []);
  }
  return byGuild.get(guildId);
}

async function saveDangerList(client, guildId, list) {
  cacheFor(client.db).set(guildId, list);
  await client.db.set(recordKey(guildId), list);
}

export async function isOnDangerList(client, guildId, userId) {
  if (!isHomeGuild(guildId) || !userId) return false;
  return (await getDangerList(client, guildId)).some((entry) => entry.userId === userId);
}

const isOwner = (guild, userId) => isServerOwner(userId) || guild.ownerId === userId;

/**
 * Takes the member's admin roles off. Returns { removed, kept }: role IDs taken off, and those the bot
 * couldn't take off (above its own role).
 */
async function takeAdminRoles(guild, userId) {
  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) return { removed: [], kept: [] };
  const admin = await staffAndDangerousRoles(guild, [...(member.roles?.cache?.values?.() || [])].filter((role) => role.id !== guild.id));
  const canTake = admin.filter((role) => role.editable !== false).map((role) => role.id);
  let kept = admin.filter((role) => role.editable === false).map((role) => role.id);
  let removed = canTake;
  if (canTake.length) {
    await member.roles.remove(canTake, 'قائمة الخطر: شيل رولات الإدارة').catch((error) => {
      logger.warn(`[DANGER] Could not take admin roles off ${userId}: ${error.message}`);
      kept = [...kept, ...canTake];
      removed = [];
    });
  }
  return { removed, kept };
}

/** Gives back the admin roles taken off when the member was added. Returns the role IDs given back. */
async function giveAdminRolesBack(guild, userId, roleIds = []) {
  if (!roleIds.length) return [];
  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) return [];
  const roles = roleIds.map((id) => guild.roles?.cache?.get(id)).filter((role) => role && role.editable !== false);
  const ids = roles.map((role) => role.id).filter((id) => !member.roles.cache.has(id));
  if (!ids.length) return [];
  return member.roles.add(ids, 'اتشال من قائمة الخطر: رجوع رولات الإدارة').then(() => ids).catch((error) => {
    logger.warn(`[DANGER] Could not give admin roles back to ${userId}: ${error.message}`);
    return [];
  });
}

/**
 * Adds a member and takes their admin roles off. Returns { ok: true, removed, kept } (role IDs taken off,
 * and those above the bot's role) or { ok: false, reason } with reason one of: owner, bot, already.
 */
export async function addToDangerList(guild, userId, addedBy, now = Date.now()) {
  if (isOwner(guild, userId)) return { ok: false, reason: 'owner' };
  if (userId === guild.client.user?.id) return { ok: false, reason: 'bot' };
  const list = await getDangerList(guild.client, guild.id);
  if (list.some((entry) => entry.userId === userId)) return { ok: false, reason: 'already' };
  const { removed, kept } = await takeAdminRoles(guild, userId);
  await saveDangerList(guild.client, guild.id, [...list, { userId, addedBy, addedAt: now, roles: removed }]);
  return { ok: true, removed, kept };
}

/**
 * Removes a member and gives back the admin roles taken off when they were added. Returns null when they
 * were not on the list, otherwise { restored, notRestored }.
 */
export async function removeFromDangerList(guild, userId) {
  const list = await getDangerList(guild.client, guild.id);
  const entry = list.find((item) => item.userId === userId);
  if (!entry) return null;
  await saveDangerList(guild.client, guild.id, list.filter((item) => item.userId !== userId));
  const restored = await giveAdminRolesBack(guild, userId, entry.roles);
  return { restored, notRestored: (entry.roles || []).filter((id) => !restored.includes(id)) };
}

const roleMentions = (ids) => ids.map((id) => `<@&${id}>`).join('، ');

async function fetchChannel(guild, channelId) {
  const channel = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);
  return channel?.send ? channel : null;
}

export function dangerBoardPayload(list) {
  const lines = list.map((entry) => `> <@${entry.userId}> ・ ضافه <@${entry.addedBy}> <t:${Math.floor(entry.addedAt / 1000)}:R>`);
  return {
    content: '',
    embeds: [{
      color: 0xe74c3c,
      title: BOARD_TITLE,
      description: [
        'أي حد في القايمة دي بتتشال منه رولات الإدارة، ولو عمل حاجة خطر ياخد **تايم أوت أسبوع**، والبوت يكتب اللي حصل في اللوج.',
        '`خطر @عضو` يضيف ・ `خطر شيل @عضو` يشيل ويرجعله رولاته ・ `خطر` يعرض القايمة (للتراستد بس).',
        '',
        lines.join('\n') || '> *القايمة فاضية*',
      ].join('\n').slice(0, 4000),
      footer: { text: `الإجمالي: ${list.length}` },
    }],
    allowedMentions: { parse: [] },
  };
}

/** Edits the danger board in the trusted channel, or posts it when it is not there yet. */
export async function refreshDangerBoard(guild) {
  const channel = await fetchChannel(guild, DANGER_NOTICE_CHANNEL_ID);
  if (!channel?.messages?.fetch) return false;
  const payload = dangerBoardPayload(await getDangerList(guild.client, guild.id));
  const existing = await findBoardMessage(channel, BOARD_KEY, (message) => Boolean(message.embeds?.[0]?.title?.includes('قائمة الخطر'))).catch(() => null);
  if (existing) {
    await existing.edit(payload).catch((error) => logger.warn(`[DANGER] Could not edit the board: ${error.message}`));
    return true;
  }
  const sent = await channel.send(payload).catch((error) => {
    logger.warn(`[DANGER] Could not post the board: ${error.message}`);
    return null;
  });
  if (sent) await rememberBoardMessage(channel, BOARD_KEY, sent.id);
  return Boolean(sent);
}

async function postNotice(guild, content) {
  const channel = await fetchChannel(guild, DANGER_NOTICE_CHANNEL_ID);
  await channel?.send({ content, allowedMentions: { parse: [] } }).catch(() => {});
}

async function reply(message, content) {
  await message.channel.send({ content, allowedMentions: { parse: [] } }).catch(() => {});
  return true;
}

async function targetFrom(message, word) {
  const match = USER_ARG.exec(word || '');
  if (match) return match[1] || match[2];
  if (!word && message.reference?.messageId) {
    const referenced = await message.fetchReference().catch(() => null);
    if (referenced?.author && !referenced.author.bot) return referenced.author.id;
  }
  return null;
}

/**
 * `خطر …` typed in our server. Returns true when the message was this command (it is then handled);
 * false lets it go on (other servers, or a normal sentence starting with the word).
 */
export async function handleDangerCommand(message, args = []) {
  const guild = message.guild;
  if (!guild || !isHomeGuild(guild.id)) return false;
  const config = await getGuildConfig(guild.client, guild.id).catch(() => null);
  // Only trusted members use it; for anyone else the word is just chat.
  if (!(await isTrusted(guild, config, message.author.id))) return false;

  const removing = REMOVE_WORDS.has(args[0]);
  const targetWord = removing ? args[1] : args[0];
  const targetId = await targetFrom(message, targetWord);

  if (!targetId) {
    if (args.length && !(removing && args.length === 1)) return false;
    if (removing) return reply(message, '⚠️ اكتب `خطر شيل @عضو`.');
    const list = await getDangerList(guild.client, guild.id);
    const lines = list.map((entry) => `• <@${entry.userId}>`).join('\n');
    return reply(message, list.length ? `☢️ **قائمة الخطر** (${list.length}):\n${lines}` : '☢️ قائمة الخطر فاضية.');
  }

  if (removing) {
    const removed = await removeFromDangerList(guild, targetId);
    if (!removed) return reply(message, `⚠️ <@${targetId}> مش في قائمة الخطر.`);
    const rolesLines = [
      ...(removed.restored.length ? [`🛡️ رجعتله رولات الإدارة: ${roleMentions(removed.restored)}`] : []),
      ...(removed.notRestored.length ? [`⚠️ مرجعتش (مش في السيرفر أو فوق رول البوت): ${roleMentions(removed.notRestored)}`] : []),
    ];
    await postNotice(guild, [`✅ <@${targetId}> اتشال من قائمة الخطر — بواسطة <@${message.author.id}>`, ...rolesLines].join('\n'));
    await refreshDangerBoard(guild);
    return reply(message, [`✅ <@${targetId}> اتشال من قائمة الخطر.`, ...rolesLines].join('\n'));
  }

  const added = await addToDangerList(guild, targetId, message.author.id);
  if (!added.ok) {
    const why = { owner: '🚫 مينفعش تضيف صاحب السيرفر.', bot: '🚫 مينفعش تضيف البوت.', already: `⚠️ <@${targetId}> في قائمة الخطر أصلاً.` };
    return reply(message, why[added.reason]);
  }
  const rolesLines = [
    ...(added.removed.length ? [`🛡️ اتشالت منه رولات الإدارة: ${roleMentions(added.removed)}`] : []),
    ...(added.kept.length ? [`⚠️ ماتشالتش (فوق رول البوت): ${roleMentions(added.kept)}`] : []),
  ];
  await postNotice(guild, [`☢️ <@${targetId}> اتضاف لقائمة الخطر — بواسطة <@${message.author.id}>`, 'لو عمل أي حاجة خطر هياخد تايم أوت أسبوع.', ...rolesLines].join('\n'));
  await refreshDangerBoard(guild);
  return reply(message, [`☢️ <@${targetId}> اتضاف لقائمة الخطر، وأي حاجة خطر يعملها = تايم أوت أسبوع.`, ...rolesLines].join('\n'));
}

export function dangerLogPayload(userId, action, result) {
  const outcome = {
    done: '⏳ أخد تايم أوت أسبوع',
    failed: '⚠️ التايم أوت مااشتغلش (رول البوت تحته أو مفيش صلاحية)',
    left: '⚠️ مش في السيرفر',
  }[result];
  return {
    embeds: [{
      color: 0xe74c3c,
      title: '☢️ حد من قائمة الخطر عمل حاجة خطر',
      description: [`👤 العضو: <@${userId}>`, `⚡ عمل: ${action}`, outcome].join('\n'),
      timestamp: new Date().toISOString(),
    }],
    allowedMentions: { parse: [] },
  };
}

/**
 * A listed member did something dangerous (`action` says what): one week of timeout and a line in the log.
 * Returns 'done', 'failed' or 'left', or null when nothing was done (not listed, an owner, or punished
 * less than a minute ago).
 */
export async function punishDanger(guild, userId, action, now = Date.now()) {
  if (!guild || !(await isOnDangerList(guild.client, guild.id, userId)) || isOwner(guild, userId)) return null;
  const key = `${guild.id}:${userId}`;
  if (now - (lastPunished.get(key) || 0) < PUNISH_COOLDOWN_MS) return null;
  lastPunished.set(key, now);

  const member = await guild.members.fetch(userId).catch(() => null);
  let result = 'left';
  if (member) {
    result = await member.timeout(DANGER_TIMEOUT_MS, `قائمة الخطر: ${action}`).then(() => 'done').catch((error) => {
      logger.warn(`[DANGER] Could not time out ${userId}: ${error.message}`);
      return 'failed';
    });
  }
  const channel = await fetchChannel(guild, DANGER_LOG_CHANNEL_ID);
  await channel?.send(dangerLogPayload(userId, action, result)).catch(() => {});
  return result;
}

/** What a listed member's audit-log entry counts as, or null when it is not dangerous. */
export function dangerAuditAction(entry) {
  if (entry.action === AuditLogEvent.MemberUpdate) {
    const timedSomeoneOut = entry.changes?.some((change) => change.key === 'communication_disabled_until' && change.new);
    return timedSomeoneOut && entry.targetId !== entry.executorId ? 'إدّى تايم أوت لعضو' : null;
  }
  return DANGER_AUDIT_ACTIONS.get(entry.action) || null;
}

/** GuildAuditLogEntryCreate: punishes a listed member's dangerous action. */
export async function handleDangerAuditEntry(entry, guild) {
  if (!guild || !isHomeGuild(guild.id) || !entry?.executorId) return null;
  if (!(await isOnDangerList(guild.client, guild.id, entry.executorId))) return null;
  const action = dangerAuditAction(entry);
  return action ? punishDanger(guild, entry.executorId, action) : null;
}

/**
 * A listed member's message with @everyone/@here or an invite link is deleted and punished.
 * Returns true when the message was handled.
 */
export async function handleDangerMessage(message) {
  const guild = message.guild;
  if (!guild || !(await isOnDangerList(guild.client, guild.id, message.author?.id))) return false;
  const content = message.content || '';
  const action = message.mentions?.everyone || EVERYONE.test(content) ? 'منشن everyone/here'
    : INVITE_LINK.test(content) ? 'بعت لينك دعوة' : null;
  if (!action || isOwner(guild, message.author.id)) return false;
  await message.delete().catch(() => {});
  await punishDanger(guild, message.author.id, action);
  return true;
}

/** A listed member ran a dangerous bot command: it is blocked and punished. Returns true when blocked. */
export async function blockDangerCommand(guild, userId, commandName) {
  if (!guild || !DANGER_COMMANDS.has(commandName) || isOwner(guild, userId)) return false;
  if (!(await isOnDangerList(guild.client, guild.id, userId))) return false;
  await punishDanger(guild, userId, `استخدم أمر \`${commandName}\``);
  return true;
}

/** For tests. */
export function resetDangerCooldowns() {
  lastPunished.clear();
}
