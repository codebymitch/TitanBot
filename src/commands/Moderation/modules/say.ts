import type { Command } from '../../../types/index.js';
import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ChannelType,
    MessageFlags,
    type ChatInputCommandInteraction,
    type GuildMember,
    type NewsChannel,
    type TextChannel,
} from 'discord.js';
import { successEmbed } from '../../../utils/embeds.js';
import { logEvent } from '../../../utils/moderation.js';
import { logger } from '../../../utils/logger.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { replyUserError, ErrorTypes } from '../../../utils/errorHandler.js';
import { sanitizeInput } from '../../../utils/validation.js';

const TEXT_CHANNEL_TYPES: (ChannelType.GuildText | ChannelType.GuildAnnouncement)[] = [
    ChannelType.GuildText,
    ChannelType.GuildAnnouncement,
];

function resolveTargetChannel(interaction: ChatInputCommandInteraction): TextChannel | NewsChannel | null {
    const selected = interaction.options.getChannel('channel');
    if (selected) {
        return selected as TextChannel | NewsChannel;
    }

    if (!interaction.channel || !(TEXT_CHANNEL_TYPES as ChannelType[]).includes(interaction.channel.type)) {
        return null;
    }

    return interaction.channel as TextChannel | NewsChannel;
}

export default {
    data: new SlashCommandBuilder()
        .setName('say')
        .setDescription('Eine einfache Nachricht als Bot senden')
        .addStringOption((option) =>
            option
                .setName('message')
                .setDescription('Die Nachricht, die der Bot senden soll')
                .setRequired(true)
                .setMaxLength(2000),
        )
        .addChannelOption((option) =>
            option
                .setName('channel')
                .setDescription('Kanal für die Nachricht (Standard: aktueller Kanal)')
                .addChannelTypes(...TEXT_CHANNEL_TYPES)
                .setRequired(false),
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .setDMPermission(false),
    category: 'moderation',
    abuseProtection: { maxAttempts: 8, windowMs: 60_000 },

    async execute(interaction, _config, client) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction, {
            flags: MessageFlags.Ephemeral,
        });
        if (!deferSuccess) {
            logger.warn('Say interaction defer failed', {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'say',
            });
            return;
        }

        const rawMessage = interaction.options.getString('message');
        const message = sanitizeInput(rawMessage, 2000);

        if (!message) {
            return replyUserError(interaction, {
                type: ErrorTypes.VALIDATION,
                message: 'Die Nachricht darf nicht leer sein.',
            });
        }

        const channel = resolveTargetChannel(interaction);
        if (!channel) {
            return replyUserError(interaction, {
                type: ErrorTypes.VALIDATION,
                message: 'Wähl einen Textkanal aus oder nutze diesen Command in einem.',
            });
        }

        const memberPermissions = channel.permissionsFor(interaction.member as GuildMember);
        const botPermissions = channel.permissionsFor(interaction.guild!.members.me!);

        if (!memberPermissions?.has(PermissionFlagsBits.SendMessages)) {
            return replyUserError(interaction, {
                type: ErrorTypes.PERMISSION,
                message: `Du hast keine Berechtigung, in ${channel} Nachrichten zu senden.`,
            });
        }

        if (!botPermissions?.has(PermissionFlagsBits.SendMessages)) {
            return replyUserError(interaction, {
                type: ErrorTypes.PERMISSION,
                message: `Ich habe keine Berechtigung, in ${channel} Nachrichten zu senden.`,
            });
        }

        const sentMessage = await channel.send({ content: message });

        await logEvent({
            client,
            guild: interaction.guild,
            event: {
                action: 'Bot Message Sent',
                target: `${channel} (${channel.id})`,
                executor: `${interaction.user.tag} (${interaction.user.id})`,
                reason: message.length > 200
                    ? `${message.slice(0, 197)}...`
                    : message,
                metadata: {
                    channelId: channel.id,
                    messageId: sentMessage.id,
                    moderatorId: interaction.user.id,
                    messageLength: message.length,
                },
            },
        });

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [
                successEmbed(
                    'Nachricht gesendet',
                    `In ${channel} gepostet. [Zur Nachricht springen](${sentMessage.url})`,
                ),
            ],
            flags: MessageFlags.Ephemeral,
        });
    },
} satisfies Command;
