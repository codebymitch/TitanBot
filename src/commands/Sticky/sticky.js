import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ChannelType,
    MessageFlags,
} from 'discord.js';
import { successEmbed, infoEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
import {
    getSticky,
    getGuildStickies,
    removeSticky,
    saveSticky,
    deleteStickyMessage,
    postSticky,
} from '../../services/stickyService.js';

const TEXT_CHANNEL_TYPES = [
    ChannelType.GuildText,
    ChannelType.GuildAnnouncement,
];

const MAX_STICKIES_PER_GUILD = 25;
const REQUIRED_BOT_PERMISSIONS = [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.ManageMessages,
];

function resolveTargetChannel(interaction) {
    const selected = interaction.options.getChannel('channel');
    if (selected) {
        return selected;
    }

    if (!interaction.channel || !TEXT_CHANNEL_TYPES.includes(interaction.channel.type)) {
        return null;
    }

    return interaction.channel;
}

function buildChannelOption(option) {
    return option
        .setName('channel')
        .setDescription('Channel to use (defaults to the current channel)')
        .addChannelTypes(...TEXT_CHANNEL_TYPES)
        .setRequired(false);
}

export default {
    data: new SlashCommandBuilder()
        .setName('sticky')
        .setDescription('Keep a message pinned to the bottom of a channel')
        .addSubcommand((subcommand) =>
            subcommand
                .setName('set')
                .setDescription('Set or update the sticky message for a channel')
                .addStringOption((option) =>
                    option
                        .setName('message')
                        .setDescription('The message to keep at the bottom (max 2000 characters)')
                        .setRequired(true)
                        .setMaxLength(2000),
                )
                .addChannelOption(buildChannelOption),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName('remove')
                .setDescription('Remove the sticky message from a channel')
                .addChannelOption(buildChannelOption),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName('toggle')
                .setDescription('Enable or disable the sticky message in a channel')
                .addChannelOption(buildChannelOption),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName('list')
                .setDescription('List all sticky messages in this server'),
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .setDMPermission(false),
    category: 'Sticky',
    abuseProtection: { maxAttempts: 8, windowMs: 60_000 },

    async execute(interaction, _config, client) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction, {
            flags: MessageFlags.Ephemeral,
        });
        if (!deferSuccess) {
            logger.warn('Sticky interaction defer failed', {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'sticky',
            });
            return;
        }

        const subcommand = interaction.options.getSubcommand();
        const guildId = interaction.guild.id;

        if (subcommand === 'list') {
            const stickies = await getGuildStickies(client, guildId);

            if (stickies.length === 0) {
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [infoEmbed('No Sticky Messages', 'This server has no sticky messages yet. Use `/sticky set` to create one.')],
                    flags: MessageFlags.Ephemeral,
                });
            }

            const lines = stickies.map((sticky) => {
                const preview = sticky.content.length > 60
                    ? `${sticky.content.slice(0, 57)}...`
                    : sticky.content;
                const status = sticky.enabled ? 'Enabled' : 'Disabled';
                return `<#${sticky.channelId}> — **${status}** — ${preview}`;
            });

            return InteractionHelper.safeEditReply(interaction, {
                embeds: [successEmbed('Sticky Messages', lines.join('\n'))],
                flags: MessageFlags.Ephemeral,
            });
        }

        const channel = resolveTargetChannel(interaction);
        if (!channel) {
            return replyUserError(interaction, {
                type: ErrorTypes.VALIDATION,
                message: 'Choose a text channel or run this command in one.',
            });
        }

        const botPermissions = channel.permissionsFor(interaction.guild.members.me);
        if (!botPermissions?.has(REQUIRED_BOT_PERMISSIONS)) {
            return replyUserError(interaction, {
                type: ErrorTypes.PERMISSION,
                message: `I need **View Channel**, **Send Messages**, and **Manage Messages** permissions in ${channel}.`,
            });
        }

        const existing = await getSticky(client, guildId, channel.id);

        if (subcommand === 'set') {
            const content = interaction.options.getString('message').trim();
            if (!content) {
                return replyUserError(interaction, {
                    type: ErrorTypes.VALIDATION,
                    message: 'The sticky message cannot be empty.',
                });
            }

            if (!existing) {
                const current = await getGuildStickies(client, guildId);
                if (current.length >= MAX_STICKIES_PER_GUILD) {
                    return replyUserError(interaction, {
                        type: ErrorTypes.VALIDATION,
                        message: `This server already has the maximum of ${MAX_STICKIES_PER_GUILD} sticky messages.`,
                    });
                }
            }

            await postSticky(guildId, channel, content, existing);

            return InteractionHelper.safeEditReply(interaction, {
                embeds: [successEmbed('Sticky Set', `The sticky message is now active in ${channel}. It will move back to the bottom whenever new messages are sent.`)],
                flags: MessageFlags.Ephemeral,
            });
        }

        if (!existing) {
            return replyUserError(interaction, {
                type: ErrorTypes.VALIDATION,
                message: `${channel} does not have a sticky message.`,
            });
        }

        if (subcommand === 'remove') {
            await deleteStickyMessage(channel, existing.lastMessageId);
            await removeSticky(guildId, channel.id);

            return InteractionHelper.safeEditReply(interaction, {
                embeds: [successEmbed('Sticky Removed', `The sticky message in ${channel} has been removed.`)],
                flags: MessageFlags.Ephemeral,
            });
        }

        if (subcommand === 'toggle') {
            if (existing.enabled) {
                await deleteStickyMessage(channel, existing.lastMessageId);
                await saveSticky(guildId, channel.id, {
                    content: existing.content,
                    enabled: false,
                    lastMessageId: null,
                });

                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [successEmbed('Sticky Disabled', `The sticky message in ${channel} is now paused.`)],
                    flags: MessageFlags.Ephemeral,
                });
            }

            await postSticky(guildId, channel, existing.content, null);

            return InteractionHelper.safeEditReply(interaction, {
                embeds: [successEmbed('Sticky Enabled', `The sticky message in ${channel} is active again.`)],
                flags: MessageFlags.Ephemeral,
            });
        }

        return replyUserError(interaction, {
            type: ErrorTypes.VALIDATION,
            message: 'Unknown subcommand.',
        });
    },
};
