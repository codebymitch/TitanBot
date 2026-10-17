import { createRequire } from 'module';
import type { EventEmitter } from 'node:events';
import { GatewayDispatchEvents } from 'discord.js';
import type { Client, GatewayDispatchPayload } from 'discord.js';
import type { Player } from 'riffy';
import { logger } from '../../utils/logger.js';
import lavalinkConfig from '../../config/music/lavalink.js';
import { setupPlayerHandler } from './playerHandler.js';

const require = createRequire(import.meta.url);
const { Riffy } = require('riffy') as typeof import('riffy');

export function initializeMusic(client: Client): void {
    if (!lavalinkConfig.nodes?.length) {
        logger.error('No Lavalink nodes configured. Add lavalink/nodes.json, set LAVALINK_NODES, or set LAVALINK_HOST in your environment.');
        return;
    }

    client.riffy = new Riffy(client, lavalinkConfig.nodes, {
        send: (payload) => {
            const guildId = payload.d?.guild_id;
            if (!guildId) {
                return;
            }

            const guild = client.guilds.cache.get(guildId);
            if (guild?.shard) {
                guild.shard.send(payload);
                return;
            }

            const shardCount = client.ws.shards.size || 1;
            const shardId = Number((BigInt(guildId) >> 22n) % BigInt(shardCount));
            client.ws.shards.get(shardId)?.send(payload);
        },
        defaultSearchPlatform: lavalinkConfig.defaultSearchPlatform,
        restVersion: lavalinkConfig.restVersion,
        bypassChecks: {
            nodeFetchInfo: true,
        },
    });

    setupPlayerHandler(client);

    client.on('raw', (packet: GatewayDispatchPayload) => {
        if (
            !([
                GatewayDispatchEvents.VoiceStateUpdate,
                GatewayDispatchEvents.VoiceServerUpdate,
            ] as GatewayDispatchEvents[]).includes(packet.t)
        ) {
            return;
        }
        client.riffy!.updateVoiceState(packet);
    });

    // 'playerError' is not in riffy's typed event map; listen through the base EventEmitter signature.
    (client.riffy as EventEmitter).on('playerError', (player: Player, error: unknown) => {
        logger.error(`Music player error in guild ${player.guildId}:`, error);
    });

    logger.info(`Music initialized with ${lavalinkConfig.nodes.length} Lavalink node(s).`);
}

export function initRiffyAfterReady(client: Client): void {
    if (client.riffy && client.user?.id) {
        client.riffy.init(client.user.id);
        logger.info('Riffy voice connection manager initialized.');
    }
}
