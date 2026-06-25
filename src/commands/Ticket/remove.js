import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { handleInteractionError, replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
import { getTicketPermissionContext } from '../../utils/ticketPermissions.js';

export default {
  data: new SlashCommandBuilder()
    .setName('remove')
    .setDescription('Remove a user from the current ticket')
    .addUserOption(opt =>
      opt.setName('user')
        .setDescription('The user to remove from this ticket')
        .setRequired(true)
    )
    .setDMPermission(false),
  category: 'ticket',

  async execute(interaction, config, client) {
    try {
      const deferred = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
      if (!deferred) return;

      const permissionContext = await getTicketPermissionContext({ client, interaction });
      if (!permissionContext.ticketData) {
        return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'This command can only be used in a valid ticket channel.' });
      }

      if (!permissionContext.canManageTicket) {
        return await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: 'You need the Ticket Staff Role to remove users from tickets.' });
      }

      const user = interaction.options.getUser('user');

      // Prevent removing the ticket creator
      const ticketCreatorId = permissionContext.ticketData?.userId;
      if (user.id === ticketCreatorId) {
        return await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: 'You cannot remove the ticket creator from their own ticket.' });
      }

      // Prevent removing yourself
      if (user.id === interaction.user.id) {
        return await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: 'You cannot remove yourself from a ticket.' });
      }

      // Check if user actually has access
      const existingPerms = interaction.channel.permissionOverwrites.cache.get(user.id);
      if (!existingPerms) {
        return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: `<@${user.id}> doesn't have explicit access to this ticket.` });
      }

      await interaction.channel.permissionOverwrites.delete(user.id);

      await InteractionHelper.safeEditReply(interaction, {
        embeds: [successEmbed('✅ User Removed', `<@${user.id}> has been removed from this ticket.`)],
      });

      await interaction.channel.send({
        embeds: [successEmbed('👤 User Removed', `<@${user.id}> was removed from this ticket by <@${interaction.user.id}>.`)],
      });

      logger.info('User removed from ticket', {
        userId: interaction.user.id,
        removedUserId: user.id,
        channelId: interaction.channel.id,
        guildId: interaction.guildId,
      });
    } catch (error) {
      logger.error('Remove command error:', error);
      await handleInteractionError(interaction, error, { subtype: 'remove_failed' });
    }
  },
};
