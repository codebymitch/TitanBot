// Player event handlers for Riffy. Adapted from Musicify playerHandler (Apache-2.0).

import { logger } from '../../utils/logger.js';
import { getGuildMusicData, clearUpdateInterval } from './playerStore.js';
import {
    buildNowPlayingEmbed,
    buildPlayerButtonRows,
} from './musicEmbeds.js';

const UPDATE_INTERVAL_MS = 15 * 1000;
const IDLE_DISCONNECT_MS = 30 * 1000;

async function editOrSendPlayerMessage(client, guildData, channelId, embed, components) {
    const channel = client.channels.cache.get(channelId);
    if (!channel) {
        guildData.playerMessageId = null;
        guildData.playerChannelId = null;
        return;
    }

    const payload = { embeds: [embed], components };

    if (guildData.playerMessageId) {
        try {
            const msg = await channel.messages.fetch(guildData.playerMessageId);
            await msg.edit(payload);
            return;
        } catch {
            guildData.playerMessageId = null;
            guildData.playerChannelId = null;
            clearUpdateInterval(guildData);
        }
    }

    try {
        const newMsg = await channel.send(payload);
        guildData.playerMessageId = newMsg.id;
        guildData.playerChannelId = channel.id;
    } catch (error) {
        logger.error('Failed to send music player message:', error);
    }
}

export async function refreshPlayerMessage(client, guildId) {
    try {
        const player = client.riffy?.players?.get(guildId);
        if (!player?.current) {
            return;
        }

        const guildData = getGuildMusicData(guildId);
        const embed = buildNowPlayingEmbed(player.current, player, guildData);
        const components = buildPlayerButtonRows(player, guildData);
        const channelId = guildData.playerChannelId || player.textChannel;
        await editOrSendPlayerMessage(client, guildData, channelId, embed, components);
    } catch (error) {
        logger.error('Failed to refresh music player message:', error);
    }
}

function startUpdateInterval(client, guildId) {
    const guildData = getGuildMusicData(guildId);
    clearUpdateInterval(guildData);
    guildData.updateInterval = setInterval(() => {
        refreshPlayerMessage(client, guildId);
    }, UPDATE_INTERVAL_MS);
}

export function setupPlayerHandler(client) {
    if (!client.riffy) {
        logger.warn('Riffy not initialized; music player handlers not attached.');
        return;
    }

    client.riffy.on('nodeConnect', (node) => {
        logger.info(`Lavalink node "${node.name}" connected.`);
    });

    client.riffy.on('nodeError', (node, error) => {
        logger.error(`Lavalink node "${node.name}" error:`, error?.message || error);
    });

    client.riffy.on('nodeDisconnect', (node) => {
        logger.warn(`Lavalink node "${node.name}" disconnected.`);
    });

    client.riffy.on('nodeReconnect', (node) => {
        logger.info(`Lavalink node "${node.name}" reconnected.`);
    });

    client.riffy.on('trackStart', async (player, track) => {
        try {
            const guildData = getGuildMusicData(player.guildId);

            if (player.previous) {
                guildData.previousTracks.push(player.previous);
                if (guildData.previousTracks.length > 20) {
                    guildData.previousTracks.shift();
                }
            }

            if (guildData.idleTimeout) {
                clearTimeout(guildData.idleTimeout);
                guildData.idleTimeout = null;
            }

            const embed = buildNowPlayingEmbed(track, player, guildData);
            const components = buildPlayerButtonRows(player, guildData);
            const channelId = guildData.playerChannelId || player.textChannel;
            await editOrSendPlayerMessage(client, guildData, channelId, embed, components);
            startUpdateInterval(client, player.guildId);
        } catch (error) {
            logger.error('Music trackStart error:', error);
        }
    });

    client.riffy.on('queueEnd', async (player) => {
        try {
            const guildData = getGuildMusicData(player.guildId);
            clearUpdateInterval(guildData);

            if (guildData.autoplay) {
                player.autoplay(player);
                return;
            }

            if (guildData.playerMessageId && guildData.playerChannelId) {
                try {
                    const channel = client.channels.cache.get(guildData.playerChannelId);
                    if (channel) {
                        const msg = await channel.messages.fetch(guildData.playerMessageId);
                        await msg.delete();
                    }
                } catch {
                    // already deleted
                }
                guildData.playerMessageId = null;
                guildData.playerChannelId = null;
            }

            if (!guildData.twentyFourSeven) {
                if (guildData.idleTimeout) {
                    clearTimeout(guildData.idleTimeout);
                }
                guildData.idleTimeout = setTimeout(() => {
                    try {
                        const currentPlayer = client.riffy.players.get(player.guildId);
                        if (currentPlayer && !currentPlayer.playing && !currentPlayer.paused && !currentPlayer.current) {
                            currentPlayer.destroy();
                        }
                    } catch {
                        // player already destroyed
                    }
                    guildData.idleTimeout = null;
                }, IDLE_DISCONNECT_MS);
            }
        } catch (error) {
            logger.error('Music queueEnd error:', error);
        }
    });

    client.riffy.on('playerDisconnect', async (player) => {
        const guildData = getGuildMusicData(player.guildId);
        clearUpdateInterval(guildData);

        if (guildData.playerMessageId && guildData.playerChannelId) {
            try {
                const channel = client.channels.cache.get(guildData.playerChannelId);
                if (channel) {
                    const msg = await channel.messages.fetch(guildData.playerMessageId);
                    await msg.delete();
                }
            } catch {
                // already deleted
            }
        }

        guildData.playerMessageId = null;
        guildData.playerChannelId = null;
        guildData.previousTracks = [];
        if (guildData.idleTimeout) {
            clearTimeout(guildData.idleTimeout);
            guildData.idleTimeout = null;
        }
    });

    client.riffy.on('trackError', async (player, track, payload) => {
        logger.error(`Track error in ${player.guildId} for "${track?.info?.title}":`, payload?.error || payload);
        const guildData = getGuildMusicData(player.guildId);
        if (guildData.playerChannelId) {
            const channel = client.channels.cache.get(guildData.playerChannelId);
            if (channel) {
                channel.send(`Failed to play **${track?.info?.title || 'track'}**. Skipping...`).catch(() => null);
            }
        }
    });

    client.riffy.on('trackStuck', async (player, track, payload) => {
        logger.warn(`Track stuck in ${player.guildId} for "${track?.info?.title}" (${payload?.thresholdMs}ms)`);
    });
}

export async function shutdownMusic(client) {
    if (!client.riffy?.players) {
        return;
    }

    for (const player of client.riffy.players.values()) {
        try {
            player.destroy();
        } catch (error) {
            logger.debug('Error destroying music player during shutdown:', error.message);
        }
    }
}
