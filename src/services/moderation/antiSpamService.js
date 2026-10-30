// antiSpamService.js — message flood protection (report #144) and the owner mention guard (report #148).
//
// Spam: a member who sends FLOOD_MESSAGES messages within FLOOD_WINDOW_MS, or the same message
// DUPLICATE_MESSAGES times within DUPLICATE_WINDOW_MS, gets a SPAM_TIMEOUT_MS timeout and those
// messages are deleted. Owners, bots and staff (Manage Messages) are left alone.
//
// Owner mentions: mentioning the owner (OWNER_PING_ID, typed in the message; replies to the owner don't
// count) in OWNER_MENTION_LIMIT messages in a row
// (each within OWNER_MENTION_WINDOW_MS of the last) deletes the last one and gives a warning.
// A message without the mention starts the count again. Only the owners may do it freely, and in our
// server the staff too (report #196: staff roles, Manage Messages, or the Anti-Nuke trusted list).

import { PermissionFlagsBits } from 'discord.js';
import { isServerOwner } from '../../config/serverOwners.js';
import { issueWarning } from './warnEscalation.js';
import { sendModerationActionLog } from './moderationActionLogService.js';
import { canLiftHardBan } from './hardBanService.js';
import { isStaffMember } from '../staffRoleHierarchyService.js';
import { isHomeGuild } from '../../config/homeGuild.js';
import { logger } from '../../utils/logger.js';

export const FLOOD_MESSAGES = 6;
export const FLOOD_WINDOW_MS = 5_000;
export const DUPLICATE_MESSAGES = 4;
export const DUPLICATE_WINDOW_MS = 30_000;
export const SPAM_TIMEOUT_MS = 10 * 60_000;

export const OWNER_PING_ID = '1159601661392715906';
export const OWNER_MENTION_LIMIT = 3;
export const OWNER_MENTION_WINDOW_MS = 10 * 60_000;
const OWNER_MENTION = new RegExp(`<@!?${OWNER_PING_ID}>`);

const NOTICE_DELETE_MS = 5_000;
const recent = new Map(); // guildId:userId -> [{ at, text, channelId, id }]
const ownerMentions = new Map(); // guildId:userId -> { count, at }

function isExempt(message) {
    return isServerOwner(message.author.id)
        || Boolean(message.member?.permissions?.has?.(PermissionFlagsBits.ManageMessages));
}

async function notice(channel, userId, text) {
    const sent = await channel.send({ content: `🚫 <@${userId}> ${text}`, allowedMentions: { users: [userId] } }).catch(() => null);
    if (sent) setTimeout(() => sent.delete().catch(() => {}), NOTICE_DELETE_MS).unref?.();
}

/** Records the message and returns the spam kind ('flood' / 'duplicate') with the messages involved, or null. */
export function trackMessage(message, now = Date.now()) {
    const key = `${message.guild.id}:${message.author.id}`;
    const text = String(message.content || '').trim().toLowerCase();
    const entries = (recent.get(key) || []).filter((entry) => now - entry.at < DUPLICATE_WINDOW_MS);
    entries.push({ at: now, text, channelId: message.channelId, id: message.id });
    recent.set(key, entries);

    const flood = entries.filter((entry) => now - entry.at < FLOOD_WINDOW_MS);
    if (flood.length >= FLOOD_MESSAGES) {
        recent.delete(key);
        return { kind: 'flood', entries: flood };
    }
    if (text) {
        const same = entries.filter((entry) => entry.text === text);
        if (same.length >= DUPLICATE_MESSAGES) {
            recent.delete(key);
            return { kind: 'duplicate', entries: same };
        }
    }
    return null;
}

/** Times the member out and deletes the spam. Returns true when the message was spam. */
export async function handleSpam(message, { now = Date.now() } = {}) {
    if (!message.guild || message.author?.bot || isExempt(message)) return false;
    const spam = trackMessage(message, now);
    if (!spam) return false;

    const byChannel = new Map();
    for (const entry of spam.entries) {
        if (!byChannel.has(entry.channelId)) byChannel.set(entry.channelId, []);
        byChannel.get(entry.channelId).push(entry.id);
    }
    for (const [channelId, ids] of byChannel) {
        const channel = message.guild.channels.cache.get(channelId) || message.channel;
        if (ids.length > 1 && channel.bulkDelete) await channel.bulkDelete(ids, true).catch(() => {});
        else await channel.messages?.delete?.(ids[0]).catch(() => {});
    }

    const reason = spam.kind === 'flood' ? 'سبام: رسايل كتير ورا بعض' : 'سبام: نفس الرسالة كذا مرة';
    const member = message.member || await message.guild.members.fetch(message.author.id).catch(() => null);
    if (member?.moderatable) {
        await member.timeout(SPAM_TIMEOUT_MS, reason).catch((error) => logger.warn(`Spam timeout failed for ${member.id}: ${error.message}`));
        await sendModerationActionLog(message.guild, { action: 'timeout', targetUser: message.author, moderatorUser: message.client.user, reason, durationMs: SPAM_TIMEOUT_MS, channel: message.channel });
    }
    await notice(message.channel, message.author.id, `${reason} ・ ⏳ تايم ${SPAM_TIMEOUT_MS / 60_000} دقايق`);
    return true;
}

/** Staff may mention the owner as much as they like in our server (report #196). */
async function isStaffMentioner(message) {
    const member = message.member || await message.guild.members?.fetch?.(message.author.id).catch(() => null);
    if (await isStaffMember(member).catch(() => false)) return true;
    return canLiftHardBan(message.guild, message.author.id).catch(() => false);
}

/** Counts messages in a row that mention the owner; the one that reaches the limit is deleted and warned. */
export async function handleOwnerMentionSpam(message, { now = Date.now() } = {}) {
    if (!message.guild || message.author?.bot || isServerOwner(message.author?.id)) return false;
    const key = `${message.guild.id}:${message.author.id}`;
    // Only a mention typed in the message counts: a reply to the owner (even with its ping on) is not one.
    const mentionsOwner = OWNER_MENTION.test(String(message.content || ''));
    if (!mentionsOwner) {
        ownerMentions.delete(key);
        return false;
    }
    if (isHomeGuild(message.guild.id) && await isStaffMentioner(message)) return false;

    const previous = ownerMentions.get(key);
    const count = previous && now - previous.at < OWNER_MENTION_WINDOW_MS ? previous.count + 1 : 1;
    if (count < OWNER_MENTION_LIMIT) {
        ownerMentions.set(key, { count, at: now });
        return false;
    }
    ownerMentions.delete(key);

    await message.delete().catch(() => {});
    const reason = `منشن صاحب السيرفر ${OWNER_MENTION_LIMIT} مرات ورا بعض`;
    const member = message.member || await message.guild.members.fetch(message.author.id).catch(() => null);
    const me = message.guild.members.me;
    let punishment = '🗑️ الرسالة اتمسحت';
    if (member && me) {
        try {
            const result = await issueWarning({ guild: message.guild, member, moderator: me, reason });
            punishment = `⚠️ وارن (${result.totalCount})${result.timeoutApplied ? ' + تايم' : ''}`;
            await sendModerationActionLog(message.guild, { action: 'warn', targetUser: message.author, moderatorUser: message.client.user, reason, warnings: result.totalCount, channel: message.channel });
        } catch (error) {
            logger.warn(`Owner mention warning failed for ${message.author.id}: ${error.message}`);
        }
    }
    await notice(message.channel, message.author.id, `متمنشنش صاحب السيرفر كتير ・ ${punishment}`);
    return true;
}
