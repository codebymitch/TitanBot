import type { Command } from '../../../types/index.js';
import { getColor, botConfig } from '../../../config/bot.js';
import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, type TextChannel } from 'discord.js';
import { successEmbed } from '../../../utils/embeds.js';
import { logger } from '../../../utils/logger.js';
import { replyUserError, ErrorTypes } from '../../../utils/errorHandler.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { getTicketPermissionContext } from '../../../utils/ticket/ticketPermissions.js';
import { updateTicketPriority } from '../../../services/ticket.js';

export default {
    data: new SlashCommandBuilder()
        .setName("priority")
        .setDescription("Legt die Priorität des aktuellen Support-Tickets fest.")
        .addStringOption((option) =>
            option
                .setName("level")
                .setDescription("Die Priorität für das Ticket.")
                .setRequired(true)
                .addChoices(
                    { name: "Dringend", value: "urgent" },
                    { name: "Hoch", value: "high" },
                    { name: "Mittel", value: "medium" },
                    { name: "Niedrig", value: "low" },
                    { name: "Keine", value: "none" },
                ),
            )
        .setDMPermission(false),
    category: "Ticket",

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
            return await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: 'Du brauchst die Berechtigung „Kanäle verwalten“ oder die eingestellte Ticket-Team-Rolle, um die Ticket-Priorität zu ändern.' });
        }

        const priorityLevel = interaction.options.getString("level")!;
        await updateTicketPriority(interaction.channel as TextChannel, priorityLevel, interaction.user);

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [
                successEmbed(
                    "Priorität aktualisiert",
                    `Ticket-Priorität auf **${(botConfig.tickets.priorities[priorityLevel as keyof typeof botConfig.tickets.priorities]?.label ?? priorityLevel).toUpperCase()}** gesetzt.`,
                ),
            ],
        });

        logger.info('Ticket priority updated successfully', {
            userId: interaction.user.id,
            userTag: interaction.user.tag,
            channelId: interaction.channel!.id,
            channelName: (interaction.channel as TextChannel).name,
            guildId: interaction.guildId,
            priority: priorityLevel,
            commandName: 'priority'
        });
    },
} satisfies Command;
