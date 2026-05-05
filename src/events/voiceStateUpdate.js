import { ChannelType, PermissionFlagsBits } from 'discord.js';
import {
    getJoinToCreateConfig, 
    registerTemporaryChannel, 
    unregisterTemporaryChannel,
    getTemporaryChannelInfo,
    formatChannelName
} from '../utils/database.js';
import { sanitizeInput } from '../utils/sanitization.js';
import { logger } from '../utils/logger.js';
import { sendLog } from '../utils/discordLogger.js'; // 🔥 NUEVO

const channelCreationCooldown = new Map();
const VOICE_CREATE_COOLDOWN_MS = 2000;
const DEFAULT_VOICE_BITRATE = 64000;
const MAX_VOICE_BITRATE = 384000;
const MIN_VOICE_BITRATE = 8000;
const MAX_CHANNEL_NAME_LENGTH = 100;
const FALLBACK_CHANNEL_NAME = 'Voice Room';
const MAX_TRACKED_COOLDOWNS = 10000;

export default {
    name: 'voiceStateUpdate',
    async execute(oldState, newState, client) {

        // 🔥 =========================
        // 🔊 LOGS DE VOICE (NUEVO)
        // 🔥 =========================
        try {
            const user = newState.member?.user;

            if (user && !user.bot) {
                // Entró
                if (!oldState.channel && newState.channel) {
                    await sendLog({
                        title: '🔊 Usuario entró a VC',
                        description: `${user.tag} → ${newState.channel.name}`,
                        color: 0x00ff00
                    });
                }

                // Salió
                if (oldState.channel && !newState.channel) {
                    await sendLog({
                        title: '🔇 Usuario salió de VC',
                        description: `${user.tag} ← ${oldState.channel.name}`,
                        color: 0xff0000
                    });
                }

                // Se movió
                if (
                    oldState.channel &&
                    newState.channel &&
                    oldState.channel.id !== newState.channel.id
                ) {
                    await sendLog({
                        title: '🔁 Usuario cambió de VC',
                        description: `${user.tag} → ${newState.channel.name}`,
                        color: 0xffff00
                    });
                }
            }
        } catch (logError) {
            logger.warn('Error en voice logs:', logError);
        }

        // 🚫 NO TOCAR — TU SISTEMA ORIGINAL
        if (newState.member.user.bot) return;

        const guildId = newState.guild.id;
        const userId = newState.member.id;
        const cooldownKey = `${guildId}-${userId}`;
        cleanupCooldownEntries();

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
                if (now - lastCreation < VOICE_CREATE_COOLDOWN_MS) {
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
            trimCooldownMapIfNeeded();

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
                const me = guild.members.me;
                if (!me) return;

                const triggerPermissions = triggerChannel.permissionsFor(me);
                if (!triggerPermissions?.has([PermissionFlagsBits.ManageChannels, PermissionFlagsBits.MoveMembers, PermissionFlagsBits.Connect])) {
                    return;
                }

                const channelOptions = config.channelOptions?.[triggerChannel.id] || {};
                const nameTemplate = channelOptions.nameTemplate || config.channelNameTemplate || "{username}'s Room";
                
                let userLimit = channelOptions.userLimit ?? config.userLimit ?? 0;
                const bitrate = clampVoiceBitrate(channelOptions.bitrate ?? config.bitrate ?? DEFAULT_VOICE_BITRATE);

                userLimit = Math.max(0, Math.min(99, userLimit || 0));

                const channelName = sanitizeVoiceChannelName(formatChannelName(nameTemplate, {
                    username: member.user.username,
                    displayName: member.displayName,
                    guildName: guild.name,
                    channelName: triggerChannel.name
                }));

                const tempChannel = await guild.channels.create({
                    name: channelName,
                    type: ChannelType.GuildVoice,
                    parent: triggerChannel.parentId,
                    userLimit: userLimit === 0 ? undefined : userLimit,
                    bitrate: bitrate,
                    permissionOverwrites: [
                        {
                            id: member.id,
                            allow: ['Connect', 'Speak', 'MoveMembers']
                        },
                        {
                            id: guild.id,
                            allow: ['Connect', 'Speak']
                        }
                    ]
                });

                await registerTemporaryChannel(client, guild.id, tempChannel.id, member.id, triggerChannel.id);

                if (member.voice?.channel?.id === triggerChannel.id) {
                    await member.voice.setChannel(tempChannel);
                }

            } catch (error) {
                logger.error(`Failed to create temporary channel:`, error);
                channelCreationCooldown.delete(cooldownKey);
            }
        }

        async function deleteTemporaryChannel(client, channel, guildId) {
            try {
                await unregisterTemporaryChannel(client, guildId, channel.id);
                await channel.delete();
            } catch (error) {
                logger.error(`Failed to delete temporary channel:`, error);
            }
        }

        async function transferChannelOwnership(client, channel, guildId, newOwnerId) {
            try {
                const config = await getJoinToCreateConfig(client, guildId);
                const tempChannelInfo = config.temporaryChannels[channel.id];
                
                if (!tempChannelInfo) return;

                config.temporaryChannels[channel.id].ownerId = newOwnerId;
                await client.db.set(`guild:${guildId}:jointocreate`, config);

            } catch (error) {
                logger.error(`Failed to transfer ownership:`, error);
            }
        }
    }
};

function sanitizeVoiceChannelName(inputName) {
    const safeName = sanitizeInput(String(inputName || ''), MAX_CHANNEL_NAME_LENGTH)
        .replace(/[\r\n\t]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    return safeName || FALLBACK_CHANNEL_NAME;
}

function clampVoiceBitrate(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return DEFAULT_VOICE_BITRATE;
    return Math.max(MIN_VOICE_BITRATE, Math.min(MAX_VOICE_BITRATE, Math.floor(parsed)));
}

function cleanupCooldownEntries() {
    const now = Date.now();
    for (const [key, timestamp] of channelCreationCooldown.entries()) {
        if (now - timestamp >= VOICE_CREATE_COOLDOWN_MS) {
            channelCreationCooldown.delete(key);
        }
    }
}

function trimCooldownMapIfNeeded() {
    if (channelCreationCooldown.size <= MAX_TRACKED_COOLDOWNS) return;

    const entries = [...channelCreationCooldown.entries()].sort((a, b) => a[1] - b[1]);
    const removeCount = channelCreationCooldown.size - MAX_TRACKED_COOLDOWNS;
    for (let i = 0; i < removeCount; i++) {
        channelCreationCooldown.delete(entries[i][0]);
    }
}

