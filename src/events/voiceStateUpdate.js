import { 
    getJoinToCreateConfig, 
    registerTemporaryChannel, 
    unregisterTemporaryChannel,
    getTemporaryChannelInfo,
    formatChannelName
} from '../utils/database.js';
import { logger } from '../utils/logger.js';

// Debounce map to prevent multiple channel creations
const channelCreationCooldown = new Map();

export default {
    name: 'voiceStateUpdate',
    async execute(oldState, newState, client) {
        // Ignore bot voice state changes
        if (newState.member.user.bot) return;

        const guildId = newState.guild.id;
        const userId = newState.member.id;
        const cooldownKey = `${guildId}-${userId}`;

        try {
            // Get Join to Create configuration for this guild
            const config = await getJoinToCreateConfig(client, guildId);

            // If Join to Create is not enabled, do nothing
            if (!config.enabled || config.triggerChannels.length === 0) {
                return;
            }

            // Handle user joining a voice channel
            if (!oldState.channel && newState.channel) {
                await handleVoiceJoin(client, newState, config);
            }

            // Handle user leaving a voice channel
            if (oldState.channel && !newState.channel) {
                await handleVoiceLeave(client, oldState, config);
            }

            // Handle user moving between voice channels
            if (oldState.channel && newState.channel && oldState.channel.id !== newState.channel.id) {
                await handleVoiceMove(client, oldState, newState, config);
            }

        } catch (error) {
            logger.error(`Error in voiceStateUpdate for guild ${guildId}:`, error);
        }

        async function handleVoiceJoin(client, state, config) {
            const { channel, member } = state;

            // Check if this is a trigger channel
            if (!config.triggerChannels.includes(channel.id)) {
                return;
            }

            // Check if user is on cooldown (prevent multiple creations)
            const now = Date.now();
            if (channelCreationCooldown.has(cooldownKey)) {
                const lastCreation = channelCreationCooldown.get(cooldownKey);
                if (now - lastCreation < 2000) { // 2 second cooldown
                    logger.warn(`User ${member.id} is on cooldown for channel creation`);
                    return;
                }
            }

            // Check if user already has a temporary channel
            const existingTempChannel = Object.keys(config.temporaryChannels || {}).find(
                tempChannelId => {
                    const tempInfo = config.temporaryChannels[tempChannelId];
                    return tempInfo && tempInfo.ownerId === member.id;
                }
            );

            if (existingTempChannel) {
                const tempChannel = state.guild.channels.cache.get(existingTempChannel);
                if (tempChannel) {
                    // Move user to their existing channel
                    try {
                        await member.voice.setChannel(tempChannel);
                        return;
                    } catch (error) {
                        logger.warn(`Failed to move user ${member.id} to existing channel ${existingTempChannel}:`, error);
                    }
                }
            }

            // Double-check that the user is still in the trigger channel
            // This prevents race conditions where the user might have moved channels
            if (member.voice.channel?.id !== channel.id) {
                return;
            }

            // Set cooldown before creating channel
            channelCreationCooldown.set(cooldownKey, now);

            // Create a new temporary channel
            await createTemporaryChannel(client, state, config);
        }

        async function handleVoiceLeave(client, state, config) {
            const { channel, member } = state;

            // Check if this is a temporary channel
            const tempChannelInfo = await getTemporaryChannelInfo(client, state.guild.id, channel.id);
            
            if (!tempChannelInfo) {
                return;
            }

            // Check if the channel is now empty
            if (channel.members.size === 0) {
                await deleteTemporaryChannel(client, channel, state.guild.id);
            } else if (tempChannelInfo.ownerId === member.id) {
                // If the owner left but there are still members, transfer ownership to the next member
                const nextMember = channel.members.first();
                if (nextMember) {
                    await transferChannelOwnership(client, channel, state.guild.id, nextMember.id);
                }
            }
        }

        async function handleVoiceMove(client, oldState, newState, config) {
            // Handle leaving a temporary channel
            if (oldState.channel) {
                const tempChannelInfo = await getTemporaryChannelInfo(client, oldState.guild.id, oldState.channel.id);
                
                if (tempChannelInfo) {
                    // Check if the old channel is now empty
                    if (oldState.channel.members.size === 0) {
                        await deleteTemporaryChannel(client, oldState.channel, oldState.guild.id);
                    } else if (tempChannelInfo.ownerId === oldState.member.id) {
                        // Transfer ownership if the owner left
                        const nextMember = oldState.channel.members.first();
                        if (nextMember) {
                            await transferChannelOwnership(client, oldState.channel, oldState.guild.id, nextMember.id);
                        }
                    }
                }
            }

            // Handle joining a trigger channel from a non-trigger channel
            // Only create temporary channel if user wasn't already in a trigger channel
            if (config.triggerChannels.includes(newState.channel.id) && 
                !config.triggerChannels.includes(oldState.channel?.id)) {
                await handleVoiceJoin(client, newState, config);
            }
        }

        async function createTemporaryChannel(client, state, config) {
            const { channel: triggerChannel, member, guild } = state;

            try {
                // Get channel-specific options or fall back to global config
                const channelOptions = config.channelOptions?.[triggerChannel.id] || {};
                const nameTemplate = channelOptions.nameTemplate || config.channelNameTemplate || "{username}'s Room";
                
                // Fix user limit handling - ensure we get the correct value
                let userLimit = channelOptions.userLimit ?? config.userLimit ?? 0;
                const bitrate = channelOptions.bitrate ?? config.bitrate ?? 64000;

                // Ensure userLimit is a valid number (0 means no limit)
                userLimit = Math.max(0, Math.min(99, userLimit || 0));

                logger.info(`Creating temporary channel for user ${member.id} with user limit: ${userLimit}`);

                // Format the channel name
                const channelName = formatChannelName(nameTemplate, {
                    username: member.user.username,
                    userTag: member.user.tag,
                    displayName: member.displayName,
                    guildName: guild.name,
                    channelName: triggerChannel.name
                });

                // Create the temporary channel
                const tempChannel = await guild.channels.create({
                    name: channelName,
                    type: 2, // GuildVoice
                    parent: config.categoryId,
                    userLimit: userLimit === 0 ? undefined : userLimit, // undefined for no limit
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

                // Register the temporary channel in the database
                await registerTemporaryChannel(client, guild.id, tempChannel.id, member.id, triggerChannel.id);

                // Move the user to the new channel
                await member.voice.setChannel(tempChannel);

                logger.info(`Created temporary voice channel ${tempChannel.name} (${tempChannel.id}) for user ${member.user.tag} in guild ${guild.name} with user limit ${userLimit}`);

                // Clear cooldown after successful creation
                setTimeout(() => {
                    channelCreationCooldown.delete(cooldownKey);
                }, 3000);

            } catch (error) {
                logger.error(`Failed to create temporary channel for user ${member.user.tag} in guild ${guild.name}:`, error);
                
                // Clear cooldown on error
                channelCreationCooldown.delete(cooldownKey);
                
                // Try to notify the user if possible
                try {
                    await member.send({
                        content: `❌ Failed to create your temporary voice channel. Please contact a server administrator.`
                    }).catch(() => {}); // Ignore if DMs are disabled
                } catch (dmError) {
                    // Ignore DM errors
                }
            }
        }

        async function deleteTemporaryChannel(client, channel, guildId) {
            try {
                // Unregister from database first
                await unregisterTemporaryChannel(client, guildId, channel.id);

                // Delete the actual Discord channel
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

                // Update the ownership in the database
                config.temporaryChannels[channel.id].ownerId = newOwnerId;
                await client.db.set(`guild:${guildId}:jointocreate`, config);

                // Update channel name to reflect new owner
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
