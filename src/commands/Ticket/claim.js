import { getColor } from '../../config/bot.js';
import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { errorEmbed, successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getTicketPermissionContext } from '../../utils/ticketPermissions.js';
import { claimTicket } from '../../services/ticket.js';
import { t, pickLanguage } from '../../services/i18n.js';
export default {
    data: new SlashCommandBuilder()
        .setName("claim")
        .setDescription("Claims an open ticket, assigning it to you.")
        .setDMPermission(false),

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
                    embeds: [errorEmbed(t(lang, 'wolf.cmd.ticket.permDenied'), t(lang, 'wolf.cmd.ticket.permClaim'))],
                });
            }

            const channel = interaction.channel;
            const result = await claimTicket(channel, interaction.user);
            
            if (!result.success) {
                logger.warn('Ticket claim failed - not a valid ticket channel', {
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
                embeds: [successEmbed(t(lang, 'wolf.cmd.ticket.claimedTitle'), t(lang, 'wolf.cmd.ticket.claimedDesc'))],
            });

            logger.info('Ticket claimed successfully', {
                userId: interaction.user.id,
                userTag: interaction.user.tag,
                channelId: channel.id,
                channelName: channel.name,
                guildId: interaction.guildId,
                commandName: 'claim'
            });

        } catch (error) {
            logger.error('Error executing claim command', {
                error: error.message,
                stack: error.stack,
                userId: interaction.user.id,
                channelId: interaction.channel?.id,
                guildId: interaction.guildId,
                commandName: 'claim'
            });
            await handleInteractionError(interaction, error, {
                commandName: 'claim',
                source: 'ticket_claim_command'
            });
        }
    },
};



