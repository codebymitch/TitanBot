import { createRequire } from 'module';
import { GatewayDispatchEvents } from 'discord.js';
import { logger } from '../../utils/logger.js';
import lavalinkConfig from '../../config/music/lavalink.js';
import { setupPlayerHandler } from './playerHandler.js';

const require = createRequire(import.meta.url);
const { Riffy } = require('riffy');

function sendVoicePayloadToShard(client, payload) {
    const guildId = payload?.d?.guild_id;
    if (!guildId || !client?.ws) {
        return;
    }

    const guild = client.guilds.cache.get(guildId);
    if (guild?.shard) {
        guild.shard.send(payload);
        return;
    }

    const shardCount = client.ws.shards?.size || 1;
    const shardId = Number((BigInt(guildId) >> 22n) % BigInt(shardCount));
    client.ws.shards?.get(shardId)?.send(payload);
}

export function initializeMusic(client) {
    if (!lavalinkConfig.nodes?.length) {
        logger.error(
            'No Lavalink nodes configured. Add lavalink/nodes.json, set LAVALINK_NODES, or set LAVALINK_HOST in your environment.',
        );
        return;
    }

    if (client.riffy?._gatewayBound) {
        setupPlayerHandler(client);
        return;
    }

    client.riffy = new Riffy(client, lavalinkConfig.nodes, {
        send: (payload) => sendVoicePayloadToShard(client, payload),
        defaultSearchPlatform: lavalinkConfig.defaultSearchPlatform || 'ytsearch',
        restVersion: lavalinkConfig.restVersion || 'v4',
        bypassChecks: {
            nodeFetchInfo: true,
        },
    });

    client.riffy._gatewayBound = true;
    client.riffy._initializedUserId = null;

    setupPlayerHandler(client);

    client.on('raw', (packet) => {
        if (!client.riffy) {
            return;
        }
        if (
            packet?.t !== GatewayDispatchEvents.VoiceStateUpdate
            && packet?.t !== GatewayDispatchEvents.VoiceServerUpdate
        ) {
            return;
        }
        client.riffy.updateVoiceState(packet);
    });

    client.riffy.on('playerError', (player, error) => {
        logger.error(`Music player error in guild ${player?.guildId || 'unknown'}:`, error);
    });

    logger.info(`Music initialized with ${lavalinkConfig.nodes.length} Lavalink node(s).`);
}

export function initRiffyAfterReady(client) {
    const botId = client?.user?.id;
    if (!client?.riffy || !botId) {
        return;
    }

    if (client.riffy._initializedUserId === botId) {
        return;
    }

    client.riffy.init(botId);
    client.riffy._initializedUserId = botId;
    logger.info('Riffy voice connection manager initialized.');
}
