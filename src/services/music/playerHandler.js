// Player event handlers for Riffy. Adapted from Musicify playerHandler (Apache-2.0).

import { logger } from '../../utils/logger.js';
import { getGuildMusicData, clearUpdateInterval } from './playerStore.js';
import {
    buildNowPlayingEmbed,
    buildPlayerButtonRows,
} from './musicEmbeds.js';

const UPDATE_INTERVAL_MS = 15 * 1000;
const IDLE_DISCONNECT_MS = 30 * 1000;
const NODE_LOG_INTERVAL_MS = 5 * 60 * 1000;

async function deletePlayerMessage(client, guildData) {
    if (!guildData.playerMessageId || !guildData.playerChannelId) {
        guildData.playerMessageId = null;
        guildData.playerChannelId = null;
        return;
    }

    try {
        const channel = client.channels.cache.get(guildData.playerChannelId);
        if (channel?.isTextBased?.()) {
            const msg = await channel.messages.fetch(guildData.playerMessageId);
            await msg.delete();
        }
    } catch {
        // Message already deleted or inaccessible
    } finally {
        guildData.playerMessageId = null;
        guildData.playerChannelId = null;
    }
}

async function editOrSendPlayerMessage(client, guildData, channelId, embed, components) {
    if (!channelId) {
        return;
    }

    const channel = client.channels.cache.get(channelId);
    if (!channel?.isTextBased?.()) {
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
        const guildData = getGuildMusicData(guildId);

        if (!player?.current) {
            clearUpdateInterval(guildData);
            return;
        }

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

    if (client.riffy._handlersAttached) {
        return;
    }
    client.riffy._handlersAttached = true;

    const nodeLogState = new Map();

    const shouldLogNodeEvent = (nodeName) => {
        const prev = nodeLogState.get(nodeName) ?? { lastLogAt: 0, hasConnected: false };
        const now = Date.now();
        if (now - prev.lastLogAt < NODE_LOG_INTERVAL_MS) {
            return false;
        }
        nodeLogState.set(nodeName, { ...prev, lastLogAt: now });
        return true;
    };

    const markNodeConnected = (nodeName) => {
        const prev = nodeLogState.get(nodeName) ?? { lastLogAt: 0, hasConnected: false };
        nodeLogState.set(nodeName, { ...prev, hasConnected: true });
    };

    client.riffy.on('nodeConnect', (node) => {
        const prev = nodeLogState.get(node.name) ?? { lastLogAt: 0, hasConnected: false };
        if (prev.hasConnected) {
            return;
        }
        markNodeConnected(node.name);
        logger.info(`Lavalink node "${node.name}" connected.`);
    });

    client.riffy.on('nodeReconnect', () => {
        // Intentionally silent — reconnect spam is not actionable during flapping.
    });

    client.riffy.on('nodeError', (node, error) => {
        if (!shouldLogNodeEvent(node.name)) {
            return;
        }
        logger.warn(`Lavalink node "${node.name}" error: ${error?.message || error}`);
    });

    client.riffy.on('nodeDisconnect', (node) => {
        if (!shouldLogNodeEvent(node.name)) {
            return;
        }
        logger.warn(`Lavalink node "${node.name}" disconnected.`);
    });

    client.riffy.on('trackStart', async (player, track) => {
        try {
            const guildData = getGuildMusicData(player.guildId);

            if (guildData.loop && player.loop !== guildData.loop) {
                player.setLoop(guildData.loop);
            }

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

            if (guildData.autoplay && typeof player.autoplay === 'function') {
                await player.autoplay(player);
                return;
            }

            await deletePlayerMessage(client, guildData);

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
                        // Player already destroyed
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
        await deletePlayerMessage(client, guildData);

        guildData.previousTracks = [];
        guildData.autoPaused = false;
        if (guildData.idleTimeout) {
            clearTimeout(guildData.idleTimeout);
            guildData.idleTimeout = null;
        }
    });

    client.riffy.on('trackError', async (player, track, payload) => {
        logger.error(`Track error in ${player.guildId} for "${track?.info?.title}":`, payload?.error || payload);
        const guildData = getGuildMusicData(player.guildId);
        const channelId = guildData.playerChannelId || player.textChannel;
        if (channelId) {
            const channel = client.channels.cache.get(channelId);
            if (channel?.isTextBased?.()) {
                channel.send(`Failed to play **${track?.info?.title || 'track'}**. Skipping...`).catch(() => null);
            }
        }

        if (player.queue?.length > 0) {
            player.stop();
        }
    });

    client.riffy.on('trackStuck', async (player, track, payload) => {
        logger.warn(`Track stuck in ${player.guildId} for "${track?.info?.title}" (${payload?.thresholdMs}ms)`);
        if (player.queue?.length > 0) {
            player.stop();
        }
    });
}

export async function shutdownMusic(client) {
    if (!client.riffy?.players) {
        return;
    }

    for (const player of client.riffy.players.values()) {
        try {
            const guildData = getGuildMusicData(player.guildId);
            clearUpdateInterval(guildData);
            player.destroy();
        } catch (error) {
            logger.debug('Error destroying music player during shutdown:', error.message);
        }
    }
}
