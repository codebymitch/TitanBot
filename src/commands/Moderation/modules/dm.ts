import type { Command } from '../../../types/index.js';
import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType, MessageFlags } from 'discord.js';
import { createEmbed, successEmbed, infoEmbed, warningEmbed } from '../../../utils/embeds.js';
import { logEvent } from '../../../utils/moderation.js';
import { logger } from '../../../utils/logger.js';
import { sanitizeMarkdown } from '../../../utils/validation.js';

import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { replyUserError, ErrorTypes, type ErrorLike } from '../../../utils/errorHandler.js';
export default {
    data: new SlashCommandBuilder()
        .setName("dm")
        .setDescription("Einem Nutzer eine Direktnachricht senden (nur Team)")
        .addUserOption(option =>
            option
                .setName("user")
                .setDescription("Der Nutzer, der die DM bekommen soll")
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName("message")
                .setDescription("Die Nachricht, die gesendet werden soll")
                .setRequired(true)
        )
        .addBooleanOption(option =>
            option
                .setName("anonymous")
                .setDescription("Nachricht anonym senden (Standard: false)")
                .setRequired(false)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .setDMPermission(false),
    category: "moderation",

    async execute(interaction, config, client) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) {
            logger.warn(`DM interaction defer failed`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'dm'
            });
            return;
        }

    const targetUser = interaction.options.getUser("user")!;
        const message = interaction.options.getString("message")!;
        const anonymous = interaction.options.getBoolean("anonymous") || false;

        try {
            
            if (message.length > 2000) {
                return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Nachrichten müssen kürzer als 2000 Zeichen sein.' });
            }

            if (targetUser.bot) {
                return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Du kannst Bot-Accounts keine DMs senden.' });
            }

            const sanitized = sanitizeMarkdown(message);

            const dmChannel = await targetUser.createDM();
            
            await dmChannel.send({
                embeds: [
                    successEmbed(
                        anonymous ? "Nachricht vom Team" : `Nachricht von ${interaction.user.tag}`,
                        sanitized
                    ).setFooter({
                        text: `Du kannst auf diese Nachricht nicht antworten. | Logger-ID: ${interaction.id}`
                    })
                ]
            });

            await logEvent({
                client: interaction.client,
                guild: interaction.guild,
                event: {
                    action: "DM Sent",
                    target: `${targetUser.tag} (${targetUser.id})`,
                    executor: `${interaction.user.tag} (${interaction.user.id})`,
                    reason: `Anonym: ${anonymous ? 'Ja' : 'Nein'}`,
                    metadata: {
                        userId: targetUser.id,
                        moderatorId: interaction.user.id,
                        anonymous,
                        messageLength: sanitized.length
                    }
                }
            });

            return await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    successEmbed(
                        "DM gesendet",
                        `Nachricht an ${targetUser.tag} erfolgreich gesendet`
                    ),
                ],
            });
        } catch (error) {
            logger.error('DM command error:', error);
            
if ((error as ErrorLike).code === 50007) {
                return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: `Konnte ${targetUser.tag} keine DM senden. Eventuell sind DMs deaktiviert.` });
            }
            
            return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: `DM konnte nicht gesendet werden: ${(error as ErrorLike).message}` });
        }
    }
} satisfies Command;