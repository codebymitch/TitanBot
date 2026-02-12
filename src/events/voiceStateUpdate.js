import { 
    getJoinToCreateConfig, 
    registerTemporaryChannel, 
    unregisterTemporaryChannel,
    getTemporaryChannelInfo,
    formatChannelName
} from '../utils/database.js';
import { logger } from '../utils/logger.js';

const channelCreationCooldown = new Map();

export default {
    name: 'voiceStateUpdate',
    async execute(oldState, newState, client) {
        if (newState.member.user.bot) return;

        const guildId = newState.guild.id;
        const userId = newState.member.id;
        const cooldownKey = `${guildId}-${userId}`;

        try {
            const config = await getJoinToCreateConfig(client, guildId);

            if (!config.enabled || config.triggerChannels.length === 0) {
                return;
            }

            if (!oldState.channel && newState.channel) {
                await handleVoiceJoin(client, newState, config);
            }

            if (oldState.channel && !newState.channel) {
                await handleVoiceLeave(client, oldState, config);
            }

            if (oldState.channel && newState.channel && oldState.channel.id !== newState.channel.id) {
                await handleVoiceMove(client, oldState, newState, config);
            }

        } catch (error) {
            logger.error(`Error in voiceStateUpdate for guild ${guildId}:`, error);
        }

        async function handleVoiceJoin(client, state, config) {
            const { channel, member } = state;

            if (!config.triggerChannels.includes(channel.id)) {
                return;
            }

            const now = Date.now();
            if (channelCreationCooldown.has(cooldownKey)) {
                const lastCreation = channelCreationCooldown.get(cooldownKey);
if (now - lastCreation < 2000) {
                    logger.warn(`User ${member.id} is on cooldown for channel creation`);
                    return;
                }
            }

            const existingTempChannel = Object.keys(config.temporaryChannels || {}).find(
                tempChannelId => {
                    const tempInfo = config.temporaryChannels[tempChannelId];
                    return tempInfo && tempInfo.ownerId === member.id;
                }
            );

            if (existingTempChannel) {
                const tempChannel = state.guild.channels.cache.get(existingTempChannel);
                if (tempChannel) {
                    try {
                        await member.voice.setChannel(tempChannel);
                        return;
                    } catch (error) {
                        logger.warn(`Failed to move user ${member.id} to existing channel ${existingTempChannel}:`, error);
                    }
                }
            }

            if (member.voice.channel?.id !== channel.id) {
                return;
            }

            channelCreationCooldown.set(cooldownKey, now);

            await createTemporaryChannel(client, state, config);
        }

        async function handleVoiceLeave(client, state, config) {
            const { channel, member } = state;

            const tempChannelInfo = await getTemporaryChannelInfo(client, state.guild.id, channel.id);
            
            if (!tempChannelInfo) {
                return;
            }

            if (channel.members.size === 0) {
                await deleteTemporaryChannel(client, channel, state.guild.id);
            } else if (tempChannelInfo.ownerId === member.id) {
                const nextMember = channel.members.first();
                if (nextMember) {
                    await transferChannelOwnership(client, channel, state.guild.id, nextMember.id);
                }
            }
        }

        async function handleVoiceMove(client, oldState, newState, config) {
            if (oldState.channel) {
                const tempChannelInfo = await getTemporaryChannelInfo(client, oldState.guild.id, oldState.channel.id);
                
                if (tempChannelInfo) {
                    if (oldState.channel.members.size === 0) {
                        await deleteTemporaryChannel(client, oldState.channel, oldState.guild.id);
                    } else if (tempChannelInfo.ownerId === oldState.member.id) {
                        const nextMember = oldState.channel.members.first();
                        if (nextMember) {
                            await transferChannelOwnership(client, oldState.channel, oldState.guild.id, nextMember.id);
                        }
                    }
                }
            }

            if (config.triggerChannels.includes(newState.channel.id) && 
                !config.triggerChannels.includes(oldState.channel?.id)) {
                await handleVoiceJoin(client, newState, config);
            }
        }

        async function createTemporaryChannel(client, state, config) {
            const { channel: triggerChannel, member, guild } = state;

            try {
                const channelOptions = config.channelOptions?.[triggerChannel.id] || {};
                const nameTemplate = channelOptions.nameTemplate || config.channelNameTemplate || "{username}'s Room";
                
                let userLimit = channelOptions.userLimit ?? config.userLimit ?? 0;
                const bitrate = channelOptions.bitrate ?? config.bitrate ?? 64000;

                userLimit = Math.max(0, Math.min(99, userLimit || 0));

                logger.info(`Creating temporary channel for user ${member.id} with user limit: ${userLimit}`);

                const channelName = formatChannelName(nameTemplate, {
                    username: member.user.username,
                    userTag: member.user.tag,
                    displayName: member.displayName,
                    guildName: guild.name,
                    channelName: triggerChannel.name
                });

                const tempChannel = await guild.channels.create({
                    name: channelName,
type: 2,
                    parent: triggerChannel.parentId,
userLimit: userLimit === 0 ? undefined : userLimit,
                    bitrate: bitrate,
                    permissionOverwrites: [
                        {
                            id: member.id,
                            allow: ['Connect', 'Speak', 'PrioritySpeaker', 'MoveMembers']
                        },
                        {
                            id: guild.id,
                            allow: ['Connect', 'Speak']
                        }
                    ]
                });

                await registerTemporaryChannel(client, guild.id, tempChannel.id, member.id, triggerChannel.id);

                await member.voice.setChannel(tempChannel);

                logger.info(`Created temporary voice channel ${tempChannel.name} (${tempChannel.id}) for user ${member.user.tag} in guild ${guild.name} with user limit ${userLimit}`);

                setTimeout(() => {
                    channelCreationCooldown.delete(cooldownKey);
                }, 3000);

            } catch (error) {
                logger.error(`Failed to create temporary channel for user ${member.user.tag} in guild ${guild.name}:`, error);
                
                channelCreationCooldown.delete(cooldownKey);
                
                try {
                    await member.send({
                        content: `âŒ Failed to create your temporary voice channel. Please contact a server administrator.`
}).catch(() => {});
                } catch (dmError) {
                }
            }
        }

        async function deleteTemporaryChannel(client, channel, guildId) {
            try {
                await unregisterTemporaryChannel(client, guildId, channel.id);

                await channel.delete('Temporary voice channel - empty');

                logger.info(`Deleted temporary voice channel ${channel.name} (${channel.id}) in guild ${channel.guild.name}`);

            } catch (error) {
                logger.error(`Failed to delete temporary channel ${channel.id}:`, error);
            }
        }

        async function transferChannelOwnership(client, channel, guildId, newOwnerId) {
            try {
                const config = await getJoinToCreateConfig(client, guildId);
                const tempChannelInfo = config.temporaryChannels[channel.id];
                
                if (!tempChannelInfo) return;

                config.temporaryChannels[channel.id].ownerId = newOwnerId;
                await client.db.set(`guild:${guildId}:jointocreate`, config);

                const newOwner = await channel.guild.members.fetch(newOwnerId);
                if (newOwner) {
                    const channelOptions = config.channelOptions?.[tempChannelInfo.triggerChannelId] || {};
                    const nameTemplate = channelOptions.nameTemplate || config.channelNameTemplate;
                    
                    const newChannelName = formatChannelName(nameTemplate, {
                        username: newOwner.user.username,
                        userTag: newOwner.user.tag,
                        displayName: newOwner.displayName,
                        guildName: channel.guild.name,
                        channelName: channel.guild.channels.cache.get(tempChannelInfo.triggerChannelId)?.name || 'Voice Channel'
                    });

                    await channel.setName(newChannelName);
                }

                logger.info(`Transferred ownership of temporary channel ${channel.id} to user ${newOwnerId}`);

            } catch (error) {
                logger.error(`Failed to transfer ownership of channel ${channel.id}:`, error);
            }
        }
    }
};

