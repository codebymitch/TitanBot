import type { Command } from '../../../types/index.js';
import { getColor } from '../../../config/bot.js';
import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags, type TextChannel } from 'discord.js';
import { successEmbed } from '../../../utils/embeds.js';
import { logger } from '../../../utils/logger.js';
import { replyUserError, ErrorTypes } from '../../../utils/errorHandler.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { getTicketPermissionContext } from '../../../utils/ticket/ticketPermissions.js';
import { closeTicket } from '../../../services/ticket.js';
export default {
    data: new SlashCommandBuilder()
        .setName("close")
        .setDescription("Schließt das aktuelle Ticket.")
        .setDMPermission(false)
        .addStringOption((option) =>
            option
                .setName("reason")
                .setDescription("Der Grund für das Schließen des Tickets.")
                .setRequired(false),
        ),

    async execute(interaction, guildConfig, client) {
        const deferred = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
        if (!deferred) {
            return;
        }

        const permissionContext = await getTicketPermissionContext({ client, interaction });
        if (!permissionContext.ticketData) {
            return await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: 'Dieser Command funktioniert nur in einem gültigen Ticket-Kanal.' });
        }

        if (!permissionContext.canCloseTicket) {
            return await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: 'Du brauchst die Berechtigung „Kanäle verwalten“, die eingestellte Ticket-Team-Rolle oder musst das Ticket erstellt haben, um es zu schließen.' });
        }

        const reason =
            interaction.options?.getString("reason") ||
            "Per Command ohne bestimmten Grund geschlossen.";

        await closeTicket(interaction.channel as TextChannel, interaction.user, reason);

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [
                successEmbed(
                    "Ticket geschlossen!",
                    "Dieses Ticket wurde erfolgreich geschlossen.",
                ),
            ],
        });

        logger.info('Ticket closed successfully', {
            userId: interaction.user.id,
            userTag: interaction.user.tag,
            channelId: interaction.channel!.id,
            channelName: (interaction.channel as TextChannel).name,
            guildId: interaction.guildId,
            reason: reason,
            commandName: 'close'
        });
    },
} satisfies Command;
