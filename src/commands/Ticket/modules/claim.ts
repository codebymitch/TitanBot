import type { Command } from '../../../types/index.js';
import { getColor } from '../../../config/bot.js';
import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, type TextChannel } from 'discord.js';
import { successEmbed } from '../../../utils/embeds.js';
import { logger } from '../../../utils/logger.js';
import { replyUserError, ErrorTypes } from '../../../utils/errorHandler.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { getTicketPermissionContext } from '../../../utils/ticket/ticketPermissions.js';
import { claimTicket } from '../../../services/ticket.js';
export default {
    data: new SlashCommandBuilder()
        .setName("claim")
        .setDescription("Ein offenes Ticket übernehmen und dir zuweisen.")
        .setDMPermission(false),

    async execute(interaction, guildConfig, client) {
        const deferred = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
        if (!deferred) {
            return;
        }

        const permissionContext = await getTicketPermissionContext({ client, interaction });
        if (!permissionContext.ticketData) {
            return await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: 'Dieser Command funktioniert nur in einem gültigen Ticket-Kanal.' });
        }

        if (!permissionContext.canManageTicket) {
            return await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: 'Du brauchst die Berechtigung „Kanäle verwalten“ oder die eingestellte Ticket-Team-Rolle, um Tickets zu übernehmen.' });
        }

        await claimTicket(interaction.channel as TextChannel, interaction.user);

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [
                successEmbed(
                    "Ticket übernommen!",
                    "Du hast dieses Ticket erfolgreich übernommen.",
                ),
            ],
        });

        logger.info('Ticket claimed successfully', {
            userId: interaction.user.id,
            userTag: interaction.user.tag,
            channelId: interaction.channel!.id,
            channelName: (interaction.channel as TextChannel).name,
            guildId: interaction.guildId,
            commandName: 'claim'
        });
    },
} satisfies Command;