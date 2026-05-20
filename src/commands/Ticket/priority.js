import { getColor } from '../../config/bot.js';
import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { errorEmbed, successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getTicketPermissionContext } from '../../utils/ticketPermissions.js';
import { updateTicketPriority } from '../../services/ticket.js';
import { t, pickLanguage } from '../../services/i18n.js';

export default {
    data: new SlashCommandBuilder()
        .setName("priority")
        .setDescription("Sets the priority level for the current support ticket.")
        .addStringOption((option) =>
            option
                .setName("level")
                .setDescription("The priority level for the ticket.")
                .setRequired(true)
                .addChoices(
                    { name: "🔴 Urgent", value: "urgent" },
                    { name: "🟠 High", value: "high" },
                    { name: "🟡 Medium", value: "medium" },
                    { name: "🟢 Low", value: "low" },
                    { name: "⚪ None", value: "none" },
                ),
            )
        .setDMPermission(false),
    category: "Ticket",

    async execute(interaction, guildConfig, client) {
        const lang = pickLanguage(guildConfig, interaction.guild);
        try {
            
            const deferred = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
            if (!deferred) {
                return;
            }

            const permissionContext = await getTicketPermissionContext({ client, interaction });
            if (!permissionContext.ticketData) {
                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed(t(lang, 'wolf.cmd.ticket.notTicketTitle'), t(lang, 'wolf.cmd.ticket.notTicketDesc'))],
                });
            }

            if (!permissionContext.canManageTicket) {
                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed(t(lang, 'wolf.cmd.ticket.permDenied'), t(lang, 'wolf.cmd.ticket.permPriority'))],
                });
            }

            const priorityLevel = interaction.options.getString("level");
            const result = await updateTicketPriority(interaction.channel, priorityLevel, interaction.user);
            
            if (!result.success) {
                logger.warn('Priority update failed - not a valid ticket channel', {
                    userId: interaction.user.id,
                    channelId: interaction.channel.id,
                    guildId: interaction.guildId,
                    error: result.error
                });
                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed(t(lang, 'wolf.cmd.ticket.notTicketTitle'), result.error || t(lang, 'wolf.cmd.ticket.notTicketDesc'))],
                });
            }

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [successEmbed(t(lang, 'wolf.cmd.ticket.priorityUpdated'), t(lang, 'wolf.cmd.ticket.prioritySetTo', { level: priorityLevel.toUpperCase() }))],
            });

            logger.info('Ticket priority updated successfully', {
                userId: interaction.user.id,
                userTag: interaction.user.tag,
                channelId: interaction.channel.id,
                channelName: interaction.channel.name,
                guildId: interaction.guildId,
                priority: priorityLevel,
                commandName: 'priority'
            });

        } catch (error) {
            logger.error('Error executing priority command', {
                error: error.message,
                stack: error.stack,
                userId: interaction.user.id,
                channelId: interaction.channel?.id,
                guildId: interaction.guildId,
                commandName: 'priority'
            });
            await handleInteractionError(interaction, error, {
                commandName: 'priority',
                source: 'ticket_priority_command'
            });
        }
    },
};




