// ccTopBoard.js — the live Top CC board in the games channel. One bot post that is edited every few
// minutes so the leaderboard stays current; restarts keep editing the same post (its ID is saved
// in the guild config by utils/boardMessage.js), and it is only sent again when it was deleted.

import { logger } from '../../utils/logger.js';
import { findBoardMessage, rememberBoardMessage } from '../../utils/boardMessage.js';
import { ccTopEmbed } from '../../commands/Games/cctop.js';
import { GAMES_CHANNEL_ID } from './gamesChannel.js';

export const CC_TOP_BOARD_REFRESH_MS = 5 * 60 * 1000;
// The footer marks the live board, so `top cc` replies (same title) are never taken for it.
export const CC_TOP_BOARD_FOOTER = '🔄 بيتحدث تلقائي كل 5 دقايق • آخر تحديث';
const BOARD_KEY = 'cctop';

let queue = Promise.resolve();
let timer = null;

export function isCCTopBoard(message) {
    return message.embeds?.[0]?.footer?.text === CC_TOP_BOARD_FOOTER;
}

export async function buildCCTopBoard(client, guild) {
    const embed = await ccTopEmbed(client, guild);
    return { ...embed, footer: { text: CC_TOP_BOARD_FOOTER }, timestamp: new Date().toISOString() };
}

async function publish(client) {
    const channel = await client.channels.fetch(GAMES_CHANNEL_ID).catch(() => null);
    if (!channel?.guild || !channel.isTextBased?.() || !channel.messages?.fetch) {
        return { status: 'no-channel', channelId: GAMES_CHANNEL_ID };
    }

    const payload = { content: '', embeds: [await buildCCTopBoard(client, channel.guild)], allowedMentions: { parse: [] } };
    const existing = await findBoardMessage(channel, BOARD_KEY, isCCTopBoard);
    if (existing) {
        await existing.edit(payload);
        return { status: 'updated', channelId: channel.id };
    }
    const sent = await channel.send(payload);
    await rememberBoardMessage(channel, BOARD_KEY, sent.id);
    return { status: 'sent', channelId: channel.id };
}

/**
 * Edits the board to the current leaderboard, posting it when it doesn't exist yet.
 * Calls run one after another so two refreshes never post two boards.
 * Returns { status, channelId }: 'sent', 'updated' or 'no-channel' (the bot can't see the channel).
 */
export function publishCCTopBoard(client) {
    const run = queue.then(() => publish(client));
    queue = run.catch(() => {});
    return run;
}

/** Publishes the board now and then every CC_TOP_BOARD_REFRESH_MS; failures are logged, never thrown. */
export async function startCCTopBoard(client) {
    const refresh = () => publishCCTopBoard(client).catch((error) => {
        logger.error('Failed to refresh the Top CC board:', error);
        return { status: 'failed', channelId: GAMES_CHANNEL_ID };
    });
    if (!timer) {
        timer = setInterval(refresh, CC_TOP_BOARD_REFRESH_MS);
        timer.unref?.();
    }
    return refresh();
}
