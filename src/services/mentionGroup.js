// mentionGroup.js — a saved group of people to ping together (report #226), our server only.
//
//   • `منشن` (optionally followed by a message) pings everyone in the group at once;
//   • `اضافه منشن @a @b …` adds people to the group (IDs work too, or a reply);
//   • `شيل منشن @a …` takes them out;
//   • `قائمة منشن` shows who is in it.
// Only the owners and the trusted (Anti-Nuke trusted list) use it, so nobody else can mass-ping; for anyone
// else the words are just chat.

import { isHomeGuild } from '../config/homeGuild.js';
import { getGuildConfig } from './config/guildConfig.js';
import { isTrusted } from '../utils/antiNukeLogging.js';

export const MENTION_WORD = 'منشن';
const ADD_WORDS = new Set(['اضافه', 'اضافة', 'إضافة', 'إضافه', 'ضيف', 'ضيّف']);
const REMOVE_WORDS = new Set(['شيل', 'امسح', 'مسح']);
const LIST_WORDS = new Set(['قائمة', 'قائمه', 'قايمة', 'قايمه', 'لستة', 'ليستة']);
// A ping message has to stay under Discord's 2000 characters.
export const MAX_MENTION_GROUP = 60;
const USER = /^<@!?(\d{17,20})>$|^(\d{17,20})$/u;

const recordKey = (guildId) => `guild:${guildId}:mentionGroup`;

export async function getMentionGroup(client, guildId) {
  const stored = await client.db.get(recordKey(guildId), []).catch(() => []);
  return Array.isArray(stored) ? stored : [];
}

async function saveMentionGroup(client, guildId, ids) {
  await client.db.set(recordKey(guildId), ids);
}

/** Which mention-group command a message is, from its first word and arguments, or null. */
export function mentionGroupAction(commandName, args = []) {
  const first = String(commandName || '').toLowerCase();
  if (first === MENTION_WORD) return { action: 'ping', rest: args };
  if (args[0] !== MENTION_WORD) return null;
  if (ADD_WORDS.has(first)) return { action: 'add', rest: args.slice(1) };
  if (REMOVE_WORDS.has(first)) return { action: 'remove', rest: args.slice(1) };
  if (LIST_WORDS.has(first)) return { action: 'list', rest: [] };
  return null;
}

async function reply(message, content) {
  await message.channel.send({ content, allowedMentions: { parse: [] } }).catch(() => {});
  return true;
}

async function targetsFrom(message, words) {
  const ids = words.map((word) => USER.exec(word)).filter(Boolean).map((match) => match[1] || match[2]);
  if (!ids.length && message.reference?.messageId) {
    const referenced = await message.fetchReference().catch(() => null);
    if (referenced?.author && !referenced.author.bot) ids.push(referenced.author.id);
  }
  return [...new Set(ids)];
}

/**
 * Runs `منشن` / `اضافه منشن` / `شيل منشن` / `قائمة منشن` in our server. Returns true when the message was
 * one of them (it is then handled); false lets it go on.
 */
export async function handleMentionGroupCommand(message, commandName, args = []) {
  const guild = message.guild;
  if (!guild || !isHomeGuild(guild.id)) return false;
  const parsed = mentionGroupAction(commandName, args);
  if (!parsed) return false;
  const config = await getGuildConfig(guild.client, guild.id).catch(() => null);
  if (!(await isTrusted(guild, config, message.author.id))) return false;

  const group = await getMentionGroup(guild.client, guild.id);

  if (parsed.action === 'ping') {
    if (!group.length) return reply(message, '⚠️ قائمة المنشن فاضية، ضيف ناس بـ `اضافه منشن @عضو`.');
    const text = parsed.rest.join(' ').trim();
    await message.channel.send({
      content: [group.map((id) => `<@${id}>`).join(' '), text].filter(Boolean).join('\n').slice(0, 2000),
      allowedMentions: { users: group },
    }).catch(() => {});
    return true;
  }

  if (parsed.action === 'list') {
    if (!group.length) return reply(message, '📋 قائمة المنشن فاضية.');
    return reply(message, `📋 **قائمة المنشن** (${group.length}):\n${group.map((id) => `• <@${id}>`).join('\n')}`);
  }

  const targets = await targetsFrom(message, parsed.rest);
  if (!targets.length) return reply(message, parsed.action === 'add' ? '⚠️ اكتب `اضافه منشن @عضو @عضو`.' : '⚠️ اكتب `شيل منشن @عضو`.');

  if (parsed.action === 'add') {
    const added = targets.filter((id) => !group.includes(id) && id !== guild.client.user?.id);
    const room = MAX_MENTION_GROUP - group.length;
    const fits = added.slice(0, Math.max(room, 0));
    if (fits.length) await saveMentionGroup(guild.client, guild.id, [...group, ...fits]);
    const lines = [
      fits.length ? `✅ اتضافوا لقائمة المنشن: ${fits.map((id) => `<@${id}>`).join(' ')}` : '⚠️ مفيش حد جديد يتضاف.',
      ...(added.length > fits.length ? [`⚠️ القايمة مليانة (${MAX_MENTION_GROUP} بالكتير).`] : []),
    ];
    return reply(message, lines.join('\n'));
  }

  const removed = targets.filter((id) => group.includes(id));
  if (!removed.length) return reply(message, '⚠️ دول مش في قائمة المنشن.');
  await saveMentionGroup(guild.client, guild.id, group.filter((id) => !removed.includes(id)));
  return reply(message, `✅ اتشالوا من قائمة المنشن: ${removed.map((id) => `<@${id}>`).join(' ')}`);
}
