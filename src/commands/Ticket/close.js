import { getColor } from '../../config/bot.js';
import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } from 'discord.js';
import { errorEmbed, successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getTicketPermissionContext } from '../../utils/ticketPermissions.js';
import { closeTicket } from '../../services/ticket.js';
import { t, pickLanguage } from '../../services/i18n.js';
export default {
    data: new SlashCommandBuilder()
        .setName("close")
        .setDescription("Closes the current ticket.")
        .setDMPermission(false)
        .addStringOption((option) =>
            option
                .setName("reason")
                .setDescription("The reason for closing the ticket.")
                .setRequired(false),
        ),

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

            if (!permissionContext.canCloseTicket) {
                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed(t(lang, 'wolf.cmd.ticket.permDenied'), t(lang, 'wolf.cmd.ticket.permClose'))],
                });
            }

            const channel = interaction.channel;
            const reason =
                interaction.options?.getString("reason") ||
                t(lang, 'wolf.cmd.ticket.closedReasonDefault');

            const result = await closeTicket(channel, interaction.user, reason);
            
            if (!result.success) {
                logger.warn('Ticket close failed - not a valid ticket channel', {
                    userId: interaction.user.id,
                    channelId: channel.id,
                    guildId: interaction.guildId,
                    error: result.error
                });
                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed(t(lang, 'wolf.cmd.ticket.notTicketTitle'), result.error || t(lang, 'wolf.cmd.ticket.notTicketDesc'))],
                });
            }

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [successEmbed(t(lang, 'wolf.cmd.ticket.closedTitle'), t(lang, 'wolf.cmd.ticket.closedDesc'))],
            });

            logger.info('Ticket closed successfully', {
                userId: interaction.user.id,
                userTag: interaction.user.tag,
                channelId: channel.id,
                channelName: channel.name,
                guildId: interaction.guildId,
                reason: reason,
                commandName: 'close'
            });

        } catch (error) {
            logger.error('Error executing close command', {
                error: error.message,
                stack: error.stack,
                userId: interaction.user.id,
                channelId: interaction.channel?.id,
                guildId: interaction.guildId,
                commandName: 'close'
            });
            await handleInteractionError(interaction, error, {
                commandName: 'close',
                source: 'ticket_close_command'
            });
        }
    },
};



