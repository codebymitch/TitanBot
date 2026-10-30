// streakService.js — the daily streak (report #229, the idea saved for later), our server only.
//
// A member keeps their streak going by posting a picture or a GIF in the streak room once a day (UTC);
// text doesn't count (owner's request), and missing a whole day starts it again at 1. The first picture
// of each day pays STREAK.base, and every STREAK.raiseEvery days of streak the daily bonus goes up by
// STREAK.raiseBy (up to STREAK.cap), plus a one-time bonus on the milestones (7, 30, 100 days); the bot
// reacts 🔥 on it. The owner asked for 250 a day that grows over time.
// Every evening (STREAK.reminderHourUtc) the bot reminds, in the streak room, the members whose streak
// would end that night.
// The streak lives next to CC in the economy record as `ccStreak: { day, count, best }`.
//
// The streak room is one fixed channel (STREAK_CHANNEL_ID): members post their daily
// picture there and the bot replies to every message (updated, already counted today, or text doesn't
// count); it also holds the live top streak board (edited every few minutes) and the daily reminder. The media role guard doesn't apply in this room. `ستريك` / `streak` shows a
// member's streak and `توب ستريك` / `top streak` the longest ones.

import { PermissionFlagsBits } from 'discord.js';
import { isHomeGuild } from '../../config/homeGuild.js';
import { CC } from '../../config/cc.js';
import { updateCCState, utcDay } from './ccService.js';
import { getEconomyKey, getEconomyPrefix } from '../../utils/database.js';
import { findBoardMessage, rememberBoardMessage } from '../../utils/boardMessage.js';
import { getGuildConfig, updateGuildConfig } from '../config/guildConfig.js';
import { MEDALS } from '../games/text.js';
import { logger } from '../../utils/logger.js';

export const STREAK = {
    base: 250,
    // Every 7 days of streak the daily bonus goes up by 50: days 1-7 = 250, 8-14 = 300, … up to 1000.
    raiseEvery: 7,
    raiseBy: 50,
    cap: 1000,
    milestones: { 7: 1000, 30: 5000, 100: 20000 },
    // 17:00 UTC is 8 PM in Egypt (summer time), well before the day ends at midnight UTC.
    reminderHourUtc: 17,
    // At most this many members are mentioned in the reminder.
    reminderMentions: 25,
};
// The streak room is this one channel, fixed by the owner: the bot never makes another one (it used to make
// a new room every few restarts and the old one stopped working).
export const STREAK_CHANNEL_ID = '1562578413217124402';
export const STREAK_BOARD_REFRESH_MS = 10 * 60 * 1000;
const STREAK_BOARD_TITLE = '🔥 Top Streak';
const BOARD_KEY = 'streak';
const REMINDER_KEY = 'streakReminderDay';
const GIF_LINK = /https?:\/\/(?:\S+\.)?(?:tenor\.com|giphy\.com)\/\S+|https?:\/\/\S+\.gif(?:\?\S*)?(?:\s|$)/iu;
const IMAGE_EXTENSION = /\.(?:png|jpe?g|gif|webp|bmp|heic|heif|avif)$/iu;
const BOARD_SIZE = 15;
const DAY_MS = 24 * 60 * 60 * 1000;

// The day each member's streak was last counted, so most messages don't touch the database.
const counted = new Map();
let timer = null;
/** Whether a message is in the streak room. */
export function isStreakChannel(channelId) {
    return channelId === STREAK_CHANNEL_ID;
}

/** Whether a message has a picture or a GIF: an image file, a GIF link (Tenor, Giphy, .gif) or its embed. */
export function hasStreakMedia(message) {
    const attachments = [...(message.attachments?.values?.() || [])];
    if (attachments.some((file) => (file.contentType ? file.contentType.startsWith('image/') : IMAGE_EXTENSION.test(file.name || '')))) return true;
    if ((message.embeds || []).some((embed) => ['gifv', 'image'].includes(embed.data?.type || embed.type))) return true;
    return GIF_LINK.test(message.content || '');
}

const n = (amount) => amount.toLocaleString('en-US');

/** CC for reaching day `count` of a streak: the daily bonus and the milestone bonus. */
export function streakBonus(count) {
    const daily = Math.min(STREAK.base + STREAK.raiseBy * Math.floor((count - 1) / STREAK.raiseEvery), STREAK.cap);
    const milestone = STREAK.milestones[count] || 0;
    return { daily, milestone, total: daily + milestone };
}

/** A member's current streak from a stored record: 0 when it ran out (no message today or yesterday). */
export function liveStreak(streak, now = Date.now()) {
    if (!streak?.day || !streak.count) return 0;
    const today = utcDay(now);
    const yesterday = utcDay(now - DAY_MS);
    return streak.day === today || streak.day === yesterday ? streak.count : 0;
}

/**
 * Counts a chat message for the streak. Returns null when nothing changed (another server, or already
 * counted today), otherwise `{ count, best, bonus, milestone, restarted }`.
 */
export async function recordStreakMessage(client, guildId, userId, now = Date.now()) {
    if (!isHomeGuild(guildId) || !userId) return null;
    const today = utcDay(now);
    const key = `${guildId}:${userId}`;
    if (counted.get(key) === today) return null;

    const result = await updateCCState(client, guildId, userId, (state, record) => {
        const previous = record.ccStreak || {};
        if (previous.day === today) return { skipSave: true, unchanged: true };
        const continues = previous.day === utcDay(now - DAY_MS);
        const count = continues ? (previous.count || 0) + 1 : 1;
        const best = Math.max(previous.best || 0, count);
        const bonus = streakBonus(count);
        state.cc += bonus.total;
        state.stats.earned += bonus.total;
        record.ccStreak = { day: today, count, best };
        return { count, best, bonus: bonus.total, milestone: bonus.milestone, restarted: !continues && (previous.count || 0) > 1 };
    });
    counted.set(key, today);
    return result?.unchanged ? null : result;
}

/** Everyone with a running streak, longest first. */
export async function getStreakLeaderboard(client, guildId, now = Date.now()) {
    const prefix = getEconomyPrefix(guildId);
    const keys = await client.db.list(prefix);
    const rows = [];
    for (const key of Array.isArray(keys) ? keys : []) {
        const record = await client.db.get(key, null);
        const count = liveStreak(record?.ccStreak, now);
        if (count > 0) rows.push({ userId: key.slice(prefix.length), count, best: record.ccStreak.best || count });
    }
    return rows.sort((a, b) => b.count - a.count || b.best - a.best);
}

export async function streakTopEmbed(client, guild, userId = null, now = Date.now()) {
    const board = await getStreakLeaderboard(client, guild.id, now);
    const lines = board.slice(0, BOARD_SIZE).map((row, index) => `${MEDALS[index] || `**#${index + 1}**`} <@${row.userId}> — **${row.count}** يوم 🔥 (أحسن: ${row.best})`);
    const summary = [];
    if (userId) {
        const rank = board.findIndex((row) => row.userId === userId) + 1;
        summary.push(`👤 ترتيبك: ${rank ? `**#${rank}**` : '—'}`);
    }
    summary.push(`👥 ${board.length} عضو عندهم ستريك`);
    return {
        color: 0xe67e22,
        title: STREAK_BOARD_TITLE,
        description: [
            lines.join('\n') || 'لسه محدش عنده ستريك. ابعت صورة أو GIF هنا كل يوم!',
            '',
            `📸 ابعت صورة أو GIF في الروم دي كل يوم عشان الستريك يكمل (الكلام مابيتحسبش)، ولو فوّت يوم كامل يرجع من 1.`,
            `🌀 كل يوم: ${n(STREAK.base)} ${CC.short}، وكل ${STREAK.raiseEvery} أيام بتزيد ${n(STREAK.raiseBy)} لحد ${n(STREAK.cap)} • 🏅 ${Object.entries(STREAK.milestones).map(([day, cc]) => `${day} يوم = ${n(cc)}`).join(' • ')}`,
            '',
            summary.join(' • '),
        ].join('\n'),
    };
}

/** `ستريك` / `streak` [@member]: a member's streak. */
export async function streakProfileLine(client, guildId, userId, now = Date.now()) {
    const record = await client.db.get(getEconomyKey(guildId, userId), null);
    const count = liveStreak(record?.ccStreak, now);
    const best = record?.ccStreak?.best || 0;
    const today = record?.ccStreak?.day === utcDay(now);
    if (!count) return `🔥 <@${userId}> معندوش ستريك دلوقتي${best ? ` (أحسن ستريك: **${best}** يوم)` : ''}. ابعت صورة أو GIF في روم الستريك النهارده عشان تبدأ.`;
    const next = streakBonus(count + 1);
    return [
        `🔥 ستريك <@${userId}>: **${count}** يوم (أحسن: **${Math.max(best, count)}**)`,
        today ? `✅ اتحسب النهارده. بكرة هتاخد **${next.total}** ${CC.short}.` : `⚠️ لسه مابعتش النهارده، ابعت صورة أو GIF في روم الستريك قبل ما اليوم يخلص عشان الستريك مايقعش.`,
    ].join('\n');
}

const PROFILE_WORDS = new Set(['ستريك', 'streak', 'الستريك']);
const TOP_WORDS = new Set(['توب', 'top']);
const USER = /^<@!?(\d{17,20})>$|^(\d{17,20})$/u;

/** `ستريك` / `top streak` typed in our server. Returns true when handled. */
export async function handleStreakCommand(message, commandName, args = []) {
    if (!isHomeGuild(message.guild?.id)) return false;
    const first = String(commandName || '').toLowerCase();
    const client = message.guild.client;
    if (TOP_WORDS.has(first) && PROFILE_WORDS.has(String(args[0] || '').toLowerCase()) && args.length === 1) {
        const embed = await streakTopEmbed(client, message.guild, message.author.id);
        await message.channel.send({ embeds: [embed], allowedMentions: { parse: [] } }).catch(() => {});
        return true;
    }
    if (!PROFILE_WORDS.has(first) || args.length > 1) return false;
    const match = args.length ? USER.exec(args[0]) : null;
    if (args.length && !match) return false;
    const userId = match ? (match[1] || match[2]) : message.author.id;
    await message.channel.send({ content: await streakProfileLine(client, message.guild.id, userId), allowedMentions: { parse: [] } }).catch(() => {});
    return true;
}

const STREAK_TOPIC = 'الستريك اليومي: ابعت صورة أو GIF هنا كل يوم عشان الستريك يكمل وتاخد CC (الكلام مابيتحسبش). اكتب `ستريك` تشوف ستريكك.';
const MEMBER_ALLOW = [
    PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AddReactions,
];

/** Members can post pictures and GIFs in the room (it was read-only at first). */
async function openForPictures(channel, guild) {
    const everyone = channel.permissionOverwrites?.cache?.get(guild.id);
    if (everyone && MEMBER_ALLOW.every((flag) => everyone.allow?.has?.(flag))) return;
    await channel.permissionOverwrites?.edit?.(guild.id, {
        ViewChannel: true, ReadMessageHistory: true, SendMessages: true, AttachFiles: true, EmbedLinks: true, AddReactions: true,
    }, { reason: 'Streak room: daily pictures' }).catch((error) => logger.warn(`[STREAK] Could not open the room: ${error.message}`));
    if (channel.topic !== STREAK_TOPIC) await channel.setTopic?.(STREAK_TOPIC).catch(() => {});
}

/** The streak room (STREAK_CHANNEL_ID). Returns null, and makes nothing, when the bot can't get it now. */
export async function ensureStreakChannel(guild) {
    if (!isHomeGuild(guild?.id)) return null;
    const channel = guild.channels.cache.get(STREAK_CHANNEL_ID) || await guild.channels.fetch(STREAK_CHANNEL_ID).catch(() => null);
    if (!channel) {
        logger.warn(`[STREAK] The streak room ${STREAK_CHANNEL_ID} was not found; nothing is created.`);
        return null;
    }
    await openForPictures(channel, guild);
    return channel;
}

const isStreakBoard = (message) => message.embeds?.[0]?.title?.includes('Top Streak');

/** Edits the live board in the streak room, posting it when it isn't there. */
export async function publishStreakBoard(guild) {
    const channel = await ensureStreakChannel(guild);
    if (!channel?.send) return { status: 'no-channel' };
    const embed = { ...(await streakTopEmbed(guild.client, guild)), footer: { text: '🔄 بيتحدث تلقائي • آخر تحديث' }, timestamp: new Date().toISOString() };
    const payload = { content: '', embeds: [embed], allowedMentions: { parse: [] } };
    const existing = await findBoardMessage(channel, BOARD_KEY, isStreakBoard).catch(() => null);
    if (existing) {
        await existing.edit(payload);
        return { status: 'updated', channelId: channel.id };
    }
    const sent = await channel.send(payload);
    await rememberBoardMessage(channel, BOARD_KEY, sent.id);
    return { status: 'sent', channelId: channel.id };
}

// Replies that only say "already counted" or "text doesn't count" go away after this long.
const SHORT_REPLY_DELETE_MS = 15_000;

/** The reply to a message in the streak room: counted now, already counted today, or text only. */
export function streakReplyText(userId, { result = null, current = 0, media = true } = {}) {
    if (!media) return `📸 <@${userId}> الكلام مابيتحسبش في الستريك، ابعت صورة أو GIF.`;
    if (result) {
        const milestone = result.milestone ? ` 🏅 وجايزة **${n(result.milestone)}**` : '';
        const restarted = result.restarted ? ' (الستريك كان وقع ورجع من الأول)' : '';
        return `🔥 <@${userId}> ستريكك اتحدث: **${result.count}** يوم${restarted}، وخدت **${n(result.bonus)}** ${CC.short}${milestone}. ارجع بكرة!`;
    }
    return `✅ <@${userId}> ستريكك متحدث النهارده خلاص (**${current}** يوم). ابعت تاني بكرة.`;
}

async function replyInRoom(message, content, deleteAfterMs = 0) {
    const sent = await message.reply?.({ content, allowedMentions: { users: [message.author.id], repliedUser: false } }).catch(() => null);
    if (sent && deleteAfterMs) setTimeout(() => sent.delete().catch(() => {}), deleteAfterMs).unref?.();
}

/**
 * messageCreate: every message in the streak room gets a reply. A picture or GIF counts for the
 * streak (🔥 on it, the reply names a milestone); one already counted today says so; text doesn't count.
 * Messages elsewhere are left alone. Never throws.
 */
export async function handleStreakMessage(message) {
    try {
        if (!isHomeGuild(message.guild?.id) || !isStreakChannel(message.channelId)) return null;
        const client = message.client || message.guild.client;
        const userId = message.author?.id;
        if (!hasStreakMedia(message)) {
            await replyInRoom(message, streakReplyText(userId, { media: false }), SHORT_REPLY_DELETE_MS);
            return null;
        }
        const result = await recordStreakMessage(client, message.guild.id, userId);
        if (result) {
            await message.react?.('🔥').catch(() => {});
            await replyInRoom(message, streakReplyText(userId, { result }));
        } else {
            const record = await client.db.get(getEconomyKey(message.guild.id, userId), null);
            await replyInRoom(message, streakReplyText(userId, { current: liveStreak(record?.ccStreak) }), SHORT_REPLY_DELETE_MS);
        }
        return result;
    } catch (error) {
        logger.warn(`[STREAK] Could not count a message: ${error.message}`);
        return null;
    }
}

/** Members whose streak runs out tonight: it was counted yesterday but not yet today. */
export async function streaksEndingTonight(client, guildId, now = Date.now()) {
    const yesterday = utcDay(now - DAY_MS);
    const prefix = getEconomyPrefix(guildId);
    const keys = await client.db.list(prefix);
    const rows = [];
    for (const key of Array.isArray(keys) ? keys : []) {
        const record = await client.db.get(key, null);
        if (record?.ccStreak?.day === yesterday && record.ccStreak.count > 0) rows.push({ userId: key.slice(prefix.length), count: record.ccStreak.count });
    }
    return rows.sort((a, b) => b.count - a.count);
}

/**
 * Once a day, from STREAK.reminderHourUtc, reminds the streak room to post today's picture and mentions
 * the members whose streak would end tonight. Returns true when the reminder was sent.
 */
export async function sendDailyReminder(guild, now = Date.now()) {
    if (!isHomeGuild(guild?.id) || new Date(now).getUTCHours() < STREAK.reminderHourUtc) return false;
    const today = utcDay(now);
    const config = await getGuildConfig(guild.client, guild.id).catch(() => null);
    if (config?.[REMINDER_KEY] === today) return false;
    const channel = await ensureStreakChannel(guild).catch(() => null);
    if (!channel?.send) return false;
    await updateGuildConfig(guild.client, guild.id, { [REMINDER_KEY]: today }).catch(() => {});

    const ending = (await streaksEndingTonight(guild.client, guild.id, now)).slice(0, STREAK.reminderMentions);
    const ids = ending.map((row) => row.userId);
    await channel.send({
        content: [
            '⏰ **تذكير الستريك:** متنساش تبعت صورة أو GIF هنا النهارده عشان الستريك بتاعك يكمل! 🔥',
            ...(ids.length ? ['', `⚠️ دول الستريك بتاعهم هيقع الليلة لو مابعتوش: ${ending.map((row) => `<@${row.userId}> (${row.count})`).join(' ')}`] : []),
        ].join('\n'),
        allowedMentions: { users: ids },
    }).catch((error) => logger.warn(`[STREAK] Could not send the reminder: ${error.message}`));
    return true;
}

/** Startup: the streak room, its board and the daily reminder in our server, checked every STREAK_BOARD_REFRESH_MS. */
export async function startStreak(client) {
    const guild = [...client.guilds.cache.values()].find((item) => isHomeGuild(item.id));
    if (!guild) return { status: 'skipped' };
    const refresh = async () => {
        const result = await publishStreakBoard(guild).catch((error) => {
            logger.error('Failed to refresh the streak board:', error);
            return { status: 'failed' };
        });
        await sendDailyReminder(guild).catch((error) => logger.error('Failed to send the streak reminder:', error));
        return result;
    };
    if (!timer) {
        timer = setInterval(refresh, STREAK_BOARD_REFRESH_MS);
        timer.unref?.();
    }
    return refresh();
}

/** For tests. */
export function resetStreakCache() {
    counted.clear();
}
