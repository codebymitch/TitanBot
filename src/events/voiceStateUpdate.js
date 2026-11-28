import { ChannelType, PermissionFlagsBits } from 'discord.js';
import {
    getJoinToCreateConfig,
    registerTemporaryChannel,
    unregisterTemporaryChannel,
    getTemporaryChannelInfo,
    formatChannelName
} from '../utils/database.js';
import { sanitizeInput } from '../utils/validation.js';
import { logger } from '../utils/logger.js';

const channelCreationCooldown = new Map();
const pendingCreations = new Set();

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
        const member = newState?.member || oldState?.member;
        const guild = newState?.guild || oldState?.guild;

        if (!member || !guild || member.user?.bot) return;

        const guildId = guild.id;
        const userId = member.id;
        const cooldownKey = `${guildId}-${userId}`;
        cleanupCooldownEntries();

        try {
            const config = await getJoinToCreateConfig(client, guildId);

            if (!config?.enabled || !Array.isArray(config.triggerChannels) || config.triggerChannels.length === 0) {
                return;
            }

            if (!oldState.channel && newState.channel) {
                await handleVoiceJoin(client, newState, config, cooldownKey);
            } else if (oldState.channel && !newState.channel) {
                await handleVoiceLeave(client, oldState, config);
            } else if (oldState.channel && newState.channel && oldState.channel.id !== newState.channel.id) {
                await handleVoiceMove(client, oldState, newState, config, cooldownKey);
            }
        } catch (error) {
            logger.error(`Error in voiceStateUpdate for guild ${guildId}:`, error); } } };  async function handleVoiceJoin(client, state, config, cooldownKey) { const { channel, member, guild } = state; if (!channel \vert{}\vert{} !member \vert{}\vert{} !guild) return;  if (!config.triggerChannels.includes(channel.id)) { return; }  if (pendingCreations.has(cooldownKey)) { return; }  const now = Date.now(); const lastCreation = channelCreationCooldown.get(cooldownKey); if (lastCreation && now - lastCreation < VOICE_CREATE_COOLDOWN_MS) { logger.warn(`User ${member.id} is on cooldown for channel creation`);
        return;
    }

    const existingTempChannelId = Object.keys(config.temporaryChannels || {}).find(
        (tempChannelId) => config.temporaryChannels[tempChannelId]?.ownerId === member.id
    );

    if (existingTempChannelId) {
        const tempChannel = guild.channels.cache.get(existingTempChannelId);
        if (tempChannel && member.voice?.channelId !== tempChannel.id) {
            try {
                await member.voice.setChannel(tempChannel);
                return;
            } catch (error) {
                logger.warn(`Failed to move user ${member.id} to existing channel${existingTempChannelId}:`, error);
            }
        }
    }

    if (member.voice?.channelId !== channel.id) {
        return;
    }

    channelCreationCooldown.set(cooldownKey, now);
    trimCooldownMapIfNeeded();
    pendingCreations.add(cooldownKey);

    try {
        await createTemporaryChannel(client, state, config, cooldownKey);
    } finally {
        pendingCreations.delete(cooldownKey);
    }
}

async function handleVoiceLeave(client, state, config) {
    const { channel, member, guild } = state;
    if (!channel || !guild) return;

    const tempChannelInfo = await getTemporaryChannelInfo(client, guild.id, channel.id);
    if (!tempChannelInfo) {
        return;
    }

    if (channel.members.size === 0) {
        await deleteTemporaryChannel(client, channel, guild.id);
    } else if (tempChannelInfo.ownerId === member?.id) {
        const nextMember = channel.members.find((m) => !m.user?.bot) || channel.members.first();
        if (nextMember) {
            await transferChannelOwnership(client, channel, guild.id, nextMember.id, config);
        }
    }
}

async function handleVoiceMove(client, oldState, newState, config, cooldownKey) {
    if (oldState.channel && oldState.guild) {
        const tempChannelInfo = await getTemporaryChannelInfo(client, oldState.guild.id, oldState.channel.id);

        if (tempChannelInfo) {
            if (oldState.channel.members.size === 0) {
                await deleteTemporaryChannel(client, oldState.channel, oldState.guild.id);
            } else if (tempChannelInfo.ownerId === oldState.member?.id) {
                const nextMember = oldState.channel.members.find((m) => !m.user?.bot) || oldState.channel.members.first();
                if (nextMember) {
                    await transferChannelOwnership(client, oldState.channel, oldState.guild.id, nextMember.id, config);
                }
            }
        }
    }

    if (
        newState.channel &&
        config.triggerChannels.includes(newState.channel.id) &&
        !config.triggerChannels.includes(oldState.channel?.id)
    ) {
        await handleVoiceJoin(client, newState, config, cooldownKey);
    }
}

async function createTemporaryChannel(client, state, config, cooldownKey) {
    const { channel: triggerChannel, member, guild } = state;

    try {
        const me = guild.members.me;
        if (!me) {
            logger.warn(`Bot member cache unavailable while creating temporary channel in guild \${guild.id}`);
            channelCreationCooldown.delete(cooldownKey);
            return;
        }

        const triggerPermissions = triggerChannel.permissionsFor(me);
        if (!triggerPermissions?.has([PermissionFlagsBits.ManageChannels, PermissionFlagsBits.MoveMembers, PermissionFlagsBits.Connect])) {
            logger.warn(`Missing required permissions for temporary channel creation in guild ${guild.id} (trigger channel${triggerChannel.id})`);
            channelCreationCooldown.delete(cooldownKey);
            return;
        }

        const channelOptions = config.channelOptions?.[triggerChannel.id] || {};
        const nameTemplate = channelOptions.nameTemplate || config.channelNameTemplate || "{username}'s Room";

        let userLimit = channelOptions.userLimit ?? config.userLimit ?? 0;
        const bitrate = clampVoiceBitrate(channelOptions.bitrate ?? config.bitrate ?? DEFAULT_VOICE_BITRATE);
        userLimit = Math.max(0, Math.min(99, Number(userLimit) || 0));

        const existingChannels = guild.channels.cache.filter(
            (c) => c.parentId === triggerChannel.parentId && c.name.startsWith(triggerChannel.name)
        ).size;

        let finalName;
        if (nameTemplate.includes('{username}') || nameTemplate.includes('{displayName}')) {
            finalName = formatChannelName(nameTemplate, {
                username: member.user.username,
                userTag: member.user.tag,
                displayName: member.displayName,
                guildName: guild.name,
                channelName: triggerChannel.name
            });
        } else {
            finalName = `${triggerChannel.name}${existingChannels + 1}`;
        }

        const channelName = sanitizeVoiceChannelName(finalName);

        if (member.voice?.channelId !== triggerChannel.id) {
            logger.debug(`Member ${member.id} no longer in trigger channel${triggerChannel.id}, aborting temporary channel creation`);
            channelCreationCooldown.delete(cooldownKey);
            return;
        }

        const tempChannel = await guild.channels.create({
            name: channelName,
            type: ChannelType.GuildVoice,
            parent: triggerChannel.parentId,
            userLimit: userLimit === 0 ? undefined : userLimit,
            bitrate,
            permissionOverwrites: [
                {
                    id: member.id,
                    allow: [
                        PermissionFlagsBits.Connect,
                        PermissionFlagsBits.Speak,
                        PermissionFlagsBits.PrioritySpeaker,
                        PermissionFlagsBits.MoveMembers
                    ]
                },
                {
                    id: guild.id,
                    allow: [PermissionFlagsBits.Connect, PermissionFlagsBits.Speak]
                }
            ]
        });

        await registerTemporaryChannel(client, guild.id, tempChannel.id, member.id, triggerChannel.id);

        if (member.voice?.channelId === triggerChannel.id) {
            await member.voice.setChannel(tempChannel);
        } else {
            logger.debug(`Skipped moving ${member.id} to temporary channel${tempChannel.id} because voice state changed`);
        }

        logger.info(`Created temporary voice channel ${tempChannel.name} (${tempChannel.id}) for user ${member.user.tag} in guild${guild.name}`);
    } catch (error) {
        logger.error(`Failed to create temporary channel for user \${member?.user?.tag} in guild \${guild?.name}:`, error);
        channelCreationCooldown.delete(cooldownKey);

        try {
            await member.send({
                content: '❌ تعذر إنشاء الروم الصوتي المؤقت الخاص بك. يرجى التواصل مع إدارة السيرفر.'
            });
        } catch (dmError) {
            logger.debug(`Unable to send temporary channel failure DM to user \${member?.id}:`, dmError);
        }
    }
}

async function deleteTemporaryChannel(client, channel, guildId) {
    try {
        await unregisterTemporaryChannel(client, guildId, channel.id);
        if (channel.deletable !== false) {
            await channel.delete('Temporary voice channel - empty');
        }
        logger.info(`Deleted temporary voice channel \${channel.name} (${channel.id}) in guild${channel.guild?.name}`);
    } catch (error) {
        logger.error(`Failed to delete temporary
