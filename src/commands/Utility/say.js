import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed } from '../../utils/embeds.js';
import { logEvent } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
import { sanitizeInput } from '../../utils/sanitization.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getColor } from '../../config/bot.js';

export default {
    data: new SlashCommandBuilder()
        .setName('say')
        .setDescription('Send a message through the bot')
        .addStringOption(option =>
            option
                .setName('message')
                .setDescription('The message to send (max 2000 characters)')
                .setRequired(true)
                .setMaxLength(2000)
        )
        .addChannelOption(option =>
            option
                .setName('channel')
                .setDescription('Channel to send the message in (defaults to current channel)')
                .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
                .setRequired(false)
        )
        .addBooleanOption(option =>
            option
                .setName('embed')
                .setDescription('Send the message as an embed (default: false)')
                .setRequired(false)
        )
        .addStringOption(option =>
            option
                .setName('embed_title')
                .setDescription('Title for the embed (only used when embed is true)')
                .setMaxLength(256)
                .setRequired(false)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .setDMPermission(false),
    category: 'Utility',

    async execute(interaction, config, client) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction, { ephemeral: true });
        if (!deferSuccess) {
            logger.warn('Say interaction defer failed', {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'say'
            });
            return;
        }

        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
            return await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    errorEmbed(
                        'Permission Denied',
                        'You need the `Manage Messages` permission to use this command.'
                    ),
                ],
                flags: MessageFlags.Ephemeral,
            });
        }

        const rawMessage = interaction.options.getString('message');
        const targetChannel = interaction.options.getChannel('channel') || interaction.channel;
        const asEmbed = interaction.options.getBoolean('embed') || false;
        const embedTitle = interaction.options.getString('embed_title') || null;

        const message = sanitizeInput(rawMessage, 2000);

        if (!message || message.length === 0) {
            return await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    errorEmbed(
                        'Invalid Message',
                        'The message cannot be empty after sanitization.'
                    ),
                ],
                flags: MessageFlags.Ephemeral,
            });
        }

        // Verify the bot has permission to send messages in the target channel
        const botMember = interaction.guild.members.me;
        if (!targetChannel.permissionsFor(botMember).has(PermissionFlagsBits.SendMessages)) {
            return await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    errorEmbed(
                        'Missing Permissions',
                        `I don't have permission to send messages in ${targetChannel}.`
                    ),
                ],
                flags: MessageFlags.Ephemeral,
            });
        }

        try {
            if (asEmbed) {
                const sayEmbed = createEmbed({
                    title: embedTitle || null,
                    description: message,
                    color: 'primary',
                    timestamp: false,
                });

                await targetChannel.send({ embeds: [sayEmbed] });
            } else {
                await targetChannel.send({ content: message });
            }

            await logEvent({
                client,
                guild: interaction.guild,
                event: {
                    action: 'Say Command Used',
                    target: `${targetChannel} (${targetChannel.id})`,
                    executor: `${interaction.user.tag} (${interaction.user.id})`,
                    reason: `Message sent${asEmbed ? ' as embed' : ''}`,
                    metadata: {
                        channelId: targetChannel.id,
                        moderatorId: interaction.user.id,
                        messageLength: message.length,
                        asEmbed,
                        embedTitle: embedTitle || null,
                    }
                }
            });

            logger.info('Say command executed', {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                targetChannelId: targetChannel.id,
                asEmbed,
                messageLength: message.length,
            });

            return await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    successEmbed(
                        `Your message was sent in ${targetChannel}.`,
                        '📨 Message Sent'
                    ),
                ],
                flags: MessageFlags.Ephemeral,
            });
        } catch (error) {
            logger.error('Say command error:', {
                error: error.message,
                stack: error.stack,
                userId: interaction.user.id,
                guildId: interaction.guildId,
                targetChannelId: targetChannel.id,
            });

            return await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    errorEmbed(
                        'Failed to Send Message',
                        `An unexpected error occurred: ${error.message}`
                    ),
                ],
                flags: MessageFlags.Ephemeral,
            });
        }
    }
};
