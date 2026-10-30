// gamesBotChannel.js — games bots (Clover) only play in their own channel, so they don't flood the chat.
//
// A message from a games bot anywhere else is deleted, with a short notice (gone after 5 seconds)
// pointing to the games bots channel. Only one notice per channel every 30 seconds, since a game
// sends several messages. Threads inside the games bots channel count as the channel.
//
// In our server a member with the trader role may open games anywhere (report #182): a games bot
// message answering a trader (their slash command, or a reply to their message) opens that channel for
// the games bot, and it stays open while the game goes on, until TRADER_GAME_IDLE_MS pass with no games
// bot message there.

import { GAMES_BOTS_CHANNEL_ID, gamesBotIds } from '../../config/games.js';
import { isHomeGuild } from '../../config/homeGuild.js';
import { getTraderRole } from './traderRoleService.js';

const NOTICE_DELETE_MS = 5_000;
const NOTICE_EVERY_MS = 30_000;
export const TRADER_GAME_IDLE_MS = 5 * 60_000;
const lastNotice = new Map(); // channelId -> timestamp
const traderGames = new Map(); // channelId -> time of the last games bot message of a trader's game

/** The member a games bot message answers: the slash command user, or the author of the message it replies to. */
async function starterOf(message) {
    const userId = message.interactionMetadata?.user?.id || message.interaction?.user?.id;
    if (userId) return userId;
    if (!message.reference?.messageId || !message.fetchReference) return null;
    const replied = await message.fetchReference().catch(() => null);
    return replied && !replied.author?.bot ? replied.author.id : null;
}

async function isTrader(message, userId) {
    const role = await getTraderRole(message.client, message.guild).catch(() => null);
    if (!role) return false;
    const member = message.guild.members?.cache?.get(userId) || await message.guild.members?.fetch?.(userId).catch(() => null);
    return Boolean(member?.roles?.cache?.has(role.id));
}

/** Whether this games bot message belongs to a game a trader opened in this channel (our server only). */
async function isTraderGame(message, now) {
    if (!isHomeGuild(message.guild.id)) return false;
    const open = now - (traderGames.get(message.channelId) ?? -Infinity) <= TRADER_GAME_IDLE_MS;
    if (!open) {
        const starter = await starterOf(message);
        if (!starter || !(await isTrader(message, starter))) return false;
    }
    traderGames.set(message.channelId, now);
    return true;
}

export function isGamesBotsChannel(channel, channelId = channel?.id) {
    return channelId === GAMES_BOTS_CHANNEL_ID || channel?.parentId === GAMES_BOTS_CHANNEL_ID;
}

/** Returns true when the message was a games bot message outside its channel (and was deleted). */
export async function handleGamesBotOutsideChannel(message, { now = Date.now() } = {}) {
    if (!message.guild || !message.author?.bot || !gamesBotIds().has(message.author.id)) return false;
    if (isGamesBotsChannel(message.channel, message.channelId)) return false;
    if (await isTraderGame(message, now)) return false;

    await message.delete().catch(() => {});
    if (now - (lastNotice.get(message.channelId) || 0) < NOTICE_EVERY_MS) return true;
    lastNotice.set(message.channelId, now);

    // The member who started the game (Clover answers slash commands) is told where to play.
    const userId = message.interactionMetadata?.user?.id || message.interaction?.user?.id || null;
    const notice = await message.channel.send({
        content: `🎮 ${userId ? `<@${userId}> ` : ''}ألعاب البوتات في <#${GAMES_BOTS_CHANNEL_ID}> بس${isHomeGuild(message.guild.id) ? '، أو في أي روم لو معاك 💼 رول التاجر' : ''}.`,
        allowedMentions: { users: userId ? [userId] : [] },
    }).catch(() => null);
    if (notice) setTimeout(() => notice.delete().catch(() => {}), NOTICE_DELETE_MS).unref?.();
    return true;
}
