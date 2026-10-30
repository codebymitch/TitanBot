// serversBoard.js — a live board of the servers the bot is in, in one fixed room of our server.
// One bot post that is edited every few minutes; restarts keep editing the same post (its ID is saved
// by utils/boardMessage.js) and it is only sent again when it was deleted.

import { logger } from '../utils/logger.js';
import { findBoardMessage, rememberBoardMessage } from '../utils/boardMessage.js';
import { isHomeGuild } from '../config/homeGuild.js';
import { buildServersList } from '../commands/Core/servers.js';

export const SERVERS_BOARD_CHANNEL_ID = '1155236383464628325';
export const SERVERS_BOARD_REFRESH_MS = 5 * 60 * 1000;
export const SERVERS_BOARD_FOOTER = '🔄 بيتحدث تلقائي كل 5 دقايق • آخر تحديث';
const BOARD_KEY = 'servers';

let queue = Promise.resolve();
let timer = null;

export function isServersBoard(message) {
    return message.embeds?.[0]?.footer?.text === SERVERS_BOARD_FOOTER;
}

export function buildServersBoard(client) {
    const guilds = [...client.guilds.cache.values()];
    return {
        title: `🌐 البوت في ${guilds.length} سيرفر`,
        description: buildServersList(guilds),
        color: 0x5865f2,
        footer: { text: SERVERS_BOARD_FOOTER },
        timestamp: new Date().toISOString(),
    };
}

async function publish(client) {
    const channel = await client.channels.fetch(SERVERS_BOARD_CHANNEL_ID).catch(() => null);
    if (!channel?.guild || !isHomeGuild(channel.guild.id) || !channel.isTextBased?.() || !channel.messages?.fetch) {
        return { status: 'no-channel', channelId: SERVERS_BOARD_CHANNEL_ID };
    }

    const payload = { content: '', embeds: [buildServersBoard(client)], allowedMentions: { parse: [] } };
    const existing = await findBoardMessage(channel, BOARD_KEY, isServersBoard);
    if (existing) {
        await existing.edit(payload);
        return { status: 'updated', channelId: channel.id };
    }
    const sent = await channel.send(payload);
    await rememberBoardMessage(channel, BOARD_KEY, sent.id);
    return { status: 'sent', channelId: channel.id };
}

/** Edits the board to the current server list, posting it when it doesn't exist yet. Calls run one after another. */
export function publishServersBoard(client) {
    const run = queue.then(() => publish(client));
    queue = run.catch(() => {});
    return run;
}

/** Publishes the board now and then every SERVERS_BOARD_REFRESH_MS; failures are logged, never thrown. */
export async function startServersBoard(client) {
    const refresh = () => publishServersBoard(client).catch((error) => {
        logger.error('Failed to refresh the servers board:', error);
        return { status: 'failed', channelId: SERVERS_BOARD_CHANNEL_ID };
    });
    if (!timer) {
        timer = setInterval(refresh, SERVERS_BOARD_REFRESH_MS);
        timer.unref?.();
    }
    return refresh();
}
