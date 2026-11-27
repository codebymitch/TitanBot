// joinToCreate.js
//
// Creates a temporary voice room when a member joins a configured trigger
// channel (named with the 🔊  voice {voiceDisplay} template) and removes the
// room once it becomes empty. The created room name is left untouched after
// creation — nothing else renames it.

import { logger } from '../utils/logger.js';
import {
    getJoinToCreateConfig,
    registerTemporaryChannel,
    unregisterTemporaryChannel,
    getTemporaryChannelInfo,
} from '../utils/database.js';
import { createTemporaryChannel } from '../services/joinToCreateService.js';

const DEFAULT_CHANNEL_NAME_TEMPLATE = '🔊  voice {voiceDisplay}';

export default {
    name: 'voiceStateUpdate',
    async execute(oldState, newState, client) {
        try {
            const member = newState.member || oldState.member;
            if (!member || member.user?.bot) return;

            const guild = newState.guild || oldState.guild;
            if (!guild) return;

            const oldChannelId = oldState.channelId;
            const newChannelId = newState.channelId;

            if (newChannelId && newChannelId !== oldChannelId) {
                await handleJoin(client, guild, member, newChannelId);
            }

            if (oldChannelId && oldChannelId !== newChannelId) {
                await handleLeave(client, guild, oldChannelId);
            }
        } catch (error) {
            logger.error(`joinToCreate error for guild ${newState?.guild?.id || oldState?.guild?.id}:`, error);
        }
    }
};

async function handleJoin(client, guild, member, channelId) {
    const config = await getJoinToCreateConfig(client, guild.id);

    if (!config.enabled || !config.triggerChannels?.includes(channelId)) {
        return;
    }

    const channelOptions = config.channelOptions?.[channelId] || {};
    // Nama channel dikunci ke template "🔊  voice {voiceDisplay}".
    // Abaikan template lawas seperti "{username}'s Room" yang mungkin tersimpan.
    const nameTemplate = DEFAULT_CHANNEL_NAME_TEMPLATE;
    const userLimit = channelOptions.userLimit ?? config.userLimit ?? 0;
    const bitrate = channelOptions.bitrate ?? config.bitrate ?? 64000;
    const parentId = channelOptions.categoryId || config.categoryId || null;

    const created = await createTemporaryChannel(guild, member, {
        nameTemplate,
        userLimit,
        bitrate,
        parentId,
    });

    await registerTemporaryChannel(client, guild.id, created.id, member.id, channelId);

    const tempChannel = guild.channels.cache.get(created.id)
        || await guild.channels.fetch(created.id).catch(() => null);

    if (tempChannel && member.voice?.channelId !== tempChannel.id) {
        await member.voice.setChannel(tempChannel).catch((error) => {
            logger.warn(`Could not move ${member.user.tag} into temporary room ${created.id}: ${error.message}`);
        });
    }
}

async function handleLeave(client, guild, channelId) {
    const tempInfo = await getTemporaryChannelInfo(client, guild.id, channelId);
    if (!tempInfo) {
        return;
    }

    const channel = guild.channels.cache.get(channelId);

    if (channel && channel.members.size > 0) {
        return;
    }

    if (channel) {
        await channel.delete('Temporary Join to Create room is empty').catch((error) => {
            logger.warn(`Could not delete temporary room ${channelId}: ${error.message}`);
        });
    }

    await unregisterTemporaryChannel(client, guild.id, channelId);
}
