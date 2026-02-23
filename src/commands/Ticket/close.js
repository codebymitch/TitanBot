import { getColor } from '../../config/bot.js';
import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType, MessageFlags } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { closeTicket } from '../../services/ticket.js';
import { logEvent } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getTicketPermissionContext } from '../../utils/ticketPermissions.js';
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
        try {
            
            const deferred = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
            if (!deferred) {
                return;
            }

            const permissionContext = await getTicketPermissionContext({ client, interaction });
            if (!permissionContext.ticketData) {
                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [
                        errorEmbed(
                            "Not a Ticket Channel",
                            "This command can only be used in a valid ticket channel.",
                        ),
                    ],
                });
            }

            if (!permissionContext.canCloseTicket) {
                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [
                        errorEmbed(
                            "Permission Denied",
                            "You need the `Manage Channels` permission, the configured `Ticket Staff Role`, or be the ticket creator to close this ticket.",
                        ),
                    ],
                });
            }

            const channel = interaction.channel;
            const reason =
                interaction.options?.getString("reason") ||
                "Closed via command without a specific reason.";

            const result = await closeTicket(channel, interaction.user, reason);
            
            if (!result.success) {
                logger.warn('Ticket close failed - not a valid ticket channel', {
                    userId: interaction.user.id,
                    channelId: channel.id,
                    guildId: interaction.guildId,
                    error: result.error
                });
                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [
                        errorEmbed(
                            "Not a Ticket Channel",
                            result.error || "This command can only be used in a valid ticket channel.",
                        ),
                    ],
                });
            }

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    successEmbed(
                        "Ticket Closed!",
                        "This ticket has been closed successfully.",
                    ),
                ],
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

            await logEvent({
                client,
                guildId: interaction.guildId,
                event: {
                    action: "Ticket Closed",
                    target: channel.toString(),
                    executor: interaction.user.toString(),
                    reason: reason
                }
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



