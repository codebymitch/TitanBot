import { getColor } from '../../config/bot.js';
import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getTicketPermissionContext } from '../../utils/ticket/ticketPermissions.js';
import { claimTicket } from '../../services/ticket.js';
export default {
    data: new SlashCommandBuilder()
        .setName("claim")
        .setDescription("Claims an open ticket, assigning it to you.")
        .setDMPermission(false),

    async execute(interaction, guildConfig, client) {
        const deferred = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
        if (!deferred) {
            return;
        }

        const permissionContext = await getTicketPermissionContext({ client, interaction });
        if (!permissionContext.ticketData) {
            return await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: 'This command can only be used in a valid ticket channel.' });
        }

        if (!permissionContext.canManageTicket) {
            return await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: 'You need the `Manage Channels` permission or the configured `Ticket Staff Role` to claim tickets.' });
        }

        await claimTicket(interaction.channel, interaction.user);

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [
                successEmbed(
                    "Ticket Claimed!",
                    "You have successfully claimed this ticket.",
                ),
            ],
        });

        logger.info('Ticket claimed successfully', {
            userId: interaction.user.id,
            userTag: interaction.user.tag,
            channelId: interaction.channel.id,
            channelName: interaction.channel.name,
            guildId: interaction.guildId,
            commandName: 'claim'
        });
    },
};