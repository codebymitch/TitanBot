import {
    MessageFlags,
    PermissionFlagsBits,
    ActionRowBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    OverwriteType,
} from 'discord.js';
import { createEmbed, successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import {
    getJoinToCreateConfig,
    saveJoinToCreateConfig,
    getTemporaryChannelInfo,
    formatChannelName,
} from '../../utils/database.js';

const USER_ID_REGEX = /^\d{17,20}$/;

export const jtcControlHandler = {
    name: 'jtc-control',
    async execute(interaction, client, args = []) {
        try {
            if (!interaction.inGuild()) {
                await replyEphemeral(interaction, 'This control panel only works inside a server.');
                return;
            }

            const action = args[0];
            const context = await resolveContext(interaction, client);

            if (context.error) {
                await replyEphemeral(interaction, context.error);
                return;
            }

            const { voiceChannel, tempInfo } = context;

            if (action === 'info') {
                await showInfo(interaction, voiceChannel, tempInfo);
                return;
            }

            if (action === 'claim') {
                await handleClaim(interaction, client, voiceChannel, tempInfo);
                return;
            }

            if (tempInfo.ownerId !== interaction.user.id) {
                await replyEphemeral(interaction, 'Only the owner of this temporary room can use these controls.');
                return;
            }

            switch (action) {
                case 'lock':
                    await voiceChannel.permissionOverwrites.edit(interaction.guild.roles.everyone, { Connect: false });
                    await replyEphemeral(interaction, '🔒 The room is now **locked** — new members cannot join.');
                    break;
                case 'unlock':
                    await voiceChannel.permissionOverwrites.edit(interaction.guild.roles.everyone, { Connect: true });
                    await replyEphemeral(interaction, '🔓 The room is now **unlocked** — everyone can join.');
                    break;
                case 'hide':
                    await voiceChannel.permissionOverwrites.edit(interaction.guild.roles.everyone, { ViewChannel: false });
                    await replyEphemeral(interaction, '🙈 The room is now **hidden** from everyone.');
                    break;
                case 'show':
                    await voiceChannel.permissionOverwrites.edit(interaction.guild.roles.everyone, { ViewChannel: true });
                    await replyEphemeral(interaction, '👁️ The room is now **visible** to everyone.');
                    break;
                case 'chat':
                    await toggleChat(interaction, voiceChannel);
                    break;
                case 'reset':
                    await resetRoom(interaction, client, voiceChannel, tempInfo);
                    break;
                case 'delete':
                    await voiceChannel.delete('Temporary room closed by its owner');
                    await replyEphemeral(interaction, '🗑️ Your temporary room has been deleted.');
                    break;
                case 'name':
                    await promptText(interaction, voiceChannel, 'name', 'Rename Room', 'New channel name', 'My Room', 100);
                    break;
                case 'limit':
                    await promptText(interaction, voiceChannel, 'limit', 'User Limit', 'Limit (0-99, 0 = unlimited)', '0', 2);
                    break;
                case 'bitrate':
                    await promptText(interaction, voiceChannel, 'bitrate', 'Bitrate', 'Bitrate in kbps (8-384)', '64', 3);
                    break;
                case 'trust':
                    await promptText(interaction, voiceChannel, 'trust', 'Trust a User', 'User ID or mention', '', 32);
                    break;
                case 'invite':
                    await promptText(interaction, voiceChannel, 'invite', 'Invite a User', 'User ID or mention', '', 32);
                    break;
                case 'block':
                    await promptText(interaction, voiceChannel, 'block', 'Block a User', 'User ID or mention', '', 32);
                    break;
                case 'unblock':
                    await promptText(interaction, voiceChannel, 'unblock', 'Unblock a User', 'User ID or mention', '', 32);
                    break;
                case 'kick':
                    await promptText(interaction, voiceChannel, 'kick', 'Kick a User', 'User ID or mention', '', 32);
                    break;
                case 'transfer':
                    await promptText(interaction, voiceChannel, 'transfer', 'Transfer Ownership', 'User ID or mention', '', 32);
                    break;
                default:
                    await replyEphemeral(interaction, 'That control is not available.');
            }
        } catch (error) {
            logger.error('Error handling Join to Create control button:', error);
            await replyEphemeral(interaction, 'Something went wrong while processing that control. Please try again.');
        }
    },
};

async function resolveContext(interaction, client) {
    const voiceChannel = interaction.member?.voice?.channel;

    if (!voiceChannel) {
        return { error: 'You must be connected to a temporary voice channel to use these controls.' };
    }

    const tempInfo = await getTemporaryChannelInfo(client, interaction.guild.id, voiceChannel.id);

    if (!tempInfo) {
        return { error: 'The voice channel you are in is not a temporary Join to Create room.' };
    }

    return { voiceChannel, tempInfo };
}

async function showInfo(interaction, voiceChannel, tempInfo) {
    const embed = createEmbed({
        title: `ℹ️ ${voiceChannel.name}`,
        color: 'info',
        fields: [
            { name: 'Owner', value: `<@${tempInfo.ownerId}>`, inline: true },
            { name: 'Members', value: `${voiceChannel.members.size}`, inline: true },
            { name: 'User Limit', value: voiceChannel.userLimit === 0 ? 'Unlimited' : `${voiceChannel.userLimit}`, inline: true },
            { name: 'Bitrate', value: `${Math.round(voiceChannel.bitrate / 1000)} kbps`, inline: true },
            { name: 'Created', value: `<t:${Math.floor((tempInfo.createdAt || Date.now()) / 1000)}:R>`, inline: true },
        ],
    });

    await replyEphemeral(interaction, { embeds: [embed] });
}

async function handleClaim(interaction, client, voiceChannel, tempInfo) {
    if (voiceChannel.members.has(tempInfo.ownerId)) {
        await replyEphemeral(interaction, 'The current owner is still in the room, so it cannot be claimed.');
        return;
    }

    await setOwner(client, interaction.guild.id, voiceChannel.id, interaction.user.id);

    await voiceChannel.permissionOverwrites.edit(interaction.user.id, {
        Connect: true,
        Speak: true,
        PrioritySpeaker: true,
        MoveMembers: true,
    }).catch(() => {});

    await replyEphemeral(interaction, '👑 You are now the owner of this room.');
}

async function toggleChat(interaction, voiceChannel) {
    const everyone = interaction.guild.roles.everyone;
    const currentOverwrite = voiceChannel.permissionOverwrites.cache.get(everyone.id);
    const isDenied = currentOverwrite?.deny?.has(PermissionFlagsBits.SendMessages) ?? false;

    await voiceChannel.permissionOverwrites.edit(everyone, { SendMessages: isDenied });

    await replyEphemeral(interaction, isDenied
        ? '💬 Text chat in this room has been **enabled**.'
        : '💬 Text chat in this room has been **disabled**.');
}

async function resetRoom(interaction, client, voiceChannel, tempInfo) {
    const config = await getJoinToCreateConfig(client, interaction.guild.id);
    const channelOptions = config.channelOptions?.[tempInfo.triggerChannelId] || {};
    const savedTemplate = channelOptions.nameTemplate || config.channelNameTemplate;
    const template = !savedTemplate || savedTemplate === "{username}'s Room"
        ? '🔊 voice {displayName}'
        : savedTemplate;

    const owner = await interaction.guild.members.fetch(tempInfo.ownerId).catch(() => null);
    const newName = formatChannelName(template, {
        username: owner?.user?.username || interaction.user.username,
        userTag: owner?.user?.tag || interaction.user.tag,
        displayName: owner?.displayName || interaction.user.displayName,
        guildName: interaction.guild.name,
    });

    await voiceChannel.setName(newName);

    const memberOverwriteIds = voiceChannel.permissionOverwrites.cache
        .filter((overwrite, id) => overwrite.type === OverwriteType.Member && id !== tempInfo.ownerId)
        .map((_, id) => id);

    for (const id of memberOverwriteIds) {
        await voiceChannel.permissionOverwrites.delete(id).catch(() => {});
    }

    await replyEphemeral(interaction, `🔄 The room has been reset to \`${newName}\`.`);
}

async function promptText(interaction, voiceChannel, action, title, label, placeholder, maxLength) {
    const customId = `jtc_control_modal_${action}_${voiceChannel.id}_${interaction.user.id}`;

    const modal = new ModalBuilder()
        .setCustomId(customId)
        .setTitle(title)
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('value')
                    .setLabel(label)
                    .setPlaceholder(placeholder || '')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
                    .setMaxLength(maxLength)
            )
        );

    await interaction.showModal(modal);

    const submission = await interaction.awaitModalSubmit({
        filter: (i) => i.customId === customId && i.user.id === interaction.user.id,
        time: 60000,
    }).catch(() => null);

    if (!submission) {
        return;
    }

    const value = submission.fields.getTextInputValue('value').trim();

    await applyModalAction(submission, action, value, voiceChannel);
}

async function applyModalAction(submission, action, value, voiceChannel) {
    const respond = (content) => submission.reply({ embeds: [successEmbed(content)], flags: MessageFlags.Ephemeral });

    switch (action) {
        case 'name':
            await voiceChannel.setName(value);
            await respond(`Room renamed to \`${value}\`.`);
            break;
        case 'limit': {
            const limit = Number.parseInt(value, 10);
            if (Number.isNaN(limit) || limit < 0 || limit > 99) {
                await replyEphemeral(submission, 'Please enter a number between 0 and 99.');
                return;
            }
            await voiceChannel.setUserLimit(limit);
            await respond(limit === 0 ? 'User limit removed (unlimited).' : `User limit set to ${limit}.`);
            break;
        }
        case 'bitrate': {
            const bitrate = Number.parseInt(value, 10);
            if (Number.isNaN(bitrate) || bitrate < 8 || bitrate > 384) {
                await replyEphemeral(submission, 'Please enter a bitrate between 8 and 384 kbps.');
                return;
            }
            await voiceChannel.setBitrate(bitrate * 1000);
            await respond(`Bitrate set to ${bitrate} kbps.`);
            break;
        }
        case 'trust':
        case 'invite':
        case 'block':
        case 'unblock':
        case 'kick':
        case 'transfer':
            await applyMemberAction(submission, action, value, voiceChannel, respond);
            break;
        default:
            await replyEphemeral(submission, 'That control is not available.');
    }
}

async function applyMemberAction(submission, action, value, voiceChannel, respond) {
    const targetId = value.replace(/[<@!>]/g, '').trim();

    if (!USER_ID_REGEX.test(targetId)) {
        await replyEphemeral(submission, 'Please provide a valid user ID or mention.');
        return;
    }

    const target = await submission.guild.members.fetch(targetId).catch(() => null);

    if (!target) {
        await replyEphemeral(submission, 'I could not find that user in this server.');
        return;
    }

    switch (action) {
        case 'trust':
            await voiceChannel.permissionOverwrites.edit(targetId, { ViewChannel: true, Connect: true, Speak: true });
            await respond(`✅ ${target} is now **trusted** in this room.`);
            break;
        case 'invite':
            await voiceChannel.permissionOverwrites.edit(targetId, { ViewChannel: true, Connect: true });
            await respond(`📨 ${target} has been **invited** to this room.`);
            break;
        case 'block':
            await voiceChannel.permissionOverwrites.edit(targetId, { Connect: false });
            if (voiceChannel.members.has(targetId)) {
                await target.voice.disconnect('Blocked from temporary room').catch(() => {});
            }
            await respond(`🚫 ${target} is now **blocked** from this room.`);
            break;
        case 'unblock':
            await voiceChannel.permissionOverwrites.edit(targetId, { Connect: null }).catch(() => {});
            await respond(`♻️ ${target} is no longer blocked.`);
            break;
        case 'kick':
            if (!voiceChannel.members.has(targetId)) {
                await replyEphemeral(submission, 'That user is not in this room.');
                return;
            }
            await target.voice.disconnect('Kicked from temporary room').catch(() => {});
            await respond(`👢 ${target} was removed from this room.`);
            break;
        case 'transfer':
            if (!voiceChannel.members.has(targetId)) {
                await replyEphemeral(submission, 'That user must be in this room to receive ownership.');
                return;
            }
            await setOwner(submission.client, submission.guild.id, voiceChannel.id, targetId);
            await voiceChannel.permissionOverwrites.edit(targetId, {
                Connect: true,
                Speak: true,
                PrioritySpeaker: true,
                MoveMembers: true,
            }).catch(() => {});
            await respond(`🔁 Ownership transferred to ${target}.`);
            break;
        default:
            await replyEphemeral(submission, 'That control is not available.');
    }
}

async function setOwner(client, guildId, channelId, ownerId) {
    const config = await getJoinToCreateConfig(client, guildId);

    if (!config.temporaryChannels?.[channelId]) {
        return;
    }

    config.temporaryChannels[channelId].ownerId = ownerId;
    await saveJoinToCreateConfig(client, guildId, config);
}

async function replyEphemeral(interaction, payload) {
    const body = typeof payload === 'string'
        ? { content: payload, flags: MessageFlags.Ephemeral }
        : { ...payload, flags: MessageFlags.Ephemeral };

    try {
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp(body);
        } else {
            await interaction.reply(body);
        }
    } catch (error) {
        logger.debug(`Failed to send Join to Create control response: ${error.message}`);
    }
}

export default jtcControlHandler;
