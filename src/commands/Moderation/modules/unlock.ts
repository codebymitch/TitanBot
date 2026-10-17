import type { Command } from '../../../types/index.js';
import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType, type TextChannel } from 'discord.js';
import { createEmbed, successEmbed, infoEmbed, warningEmbed } from '../../../utils/embeds.js';
import { logEvent } from '../../../utils/moderation.js';
import { logger } from '../../../utils/logger.js';
import { getColor } from '../../../config/bot.js';

import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { replyUserError, ErrorTypes } from '../../../utils/errorHandler.js';
export default {
    data: new SlashCommandBuilder()
        .setName("unlock")
        .setDescription(
            "Entsperrt den aktuellen Kanal (@everyone kann wieder Nachrichten senden).",
        )
.setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
    category: "moderation",

    async execute(interaction, config, client) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) {
            logger.warn(`Unlock interaction defer failed`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'unlock'
            });
            return;
        }

        const channel = interaction.channel as TextChannel;
        const everyoneRole = interaction.guild!.roles.everyone;

        try {
            const currentPermissions = channel.permissionsFor(everyoneRole);
            if (
                currentPermissions.has(PermissionFlagsBits.SendMessages) ===
                    true ||
                currentPermissions.has(PermissionFlagsBits.SendMessages) ===
                    null
            ) {
                return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: `${channel} ist nicht explizit gesperrt (alle können bereits Nachrichten senden).` });
            }

            await channel.permissionOverwrites.edit(
                everyoneRole,
                { SendMessages: true },
                {
                    type: 0,
                    reason: `Kanal entsperrt von ${interaction.user.tag}`,
},
            );

            await logEvent({
                client,
                guild: interaction.guild!,
                event: {
                    action: "Channel Unlocked",
                    target: channel.toString(),
                    executor: `${interaction.user.tag} (${interaction.user.id})`,
                    metadata: {
                        channelId: channel.id,
                        category: channel.parent?.name || 'None'
                    }
                }
            });

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    successEmbed(
                        `🔓 **Kanal entsperrt**`,
                        `${channel} ist jetzt entsperrt. Ihr könnt wieder schreiben.`,
                    ),
                ],
            });
        } catch (error) {
            logger.error('Unlock command error:', error);
            await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: 'Beim Entsperren des Kanals ist ein unerwarteter Fehler aufgetreten. Prüf meine Berechtigungen (ich brauche „Kanäle verwalten“).' });
        }
    }
} satisfies Command;