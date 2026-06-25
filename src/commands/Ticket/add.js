import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { handleInteractionError, replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
import { getTicketPermissionContext } from '../../utils/ticketPermissions.js';

export default {
  data: new SlashCommandBuilder()
    .setName('add')
    .setDescription('Add a user to the current ticket')
    .addUserOption(opt =>
      opt.setName('user')
        .setDescription('The user to add to this ticket')
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
        return await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: 'You need the Ticket Staff Role to add users to tickets.' });
      }

      const user = interaction.options.getUser('user');

      if (user.bot) {
        return await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: 'You cannot add bots to tickets.' });
      }

      // Check if user already has access
      const existingPerms = interaction.channel.permissionOverwrites.cache.get(user.id);
      if (existingPerms?.allow.has(PermissionFlagsBits.ViewChannel)) {
        return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: `<@${user.id}> already has access to this ticket.` });
      }

      await interaction.channel.permissionOverwrites.edit(user.id, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true,
        AttachFiles: true,
      });

      await InteractionHelper.safeEditReply(interaction, {
        embeds: [successEmbed('✅ User Added', `<@${user.id}> has been added to this ticket.`)],
      });

      await interaction.channel.send({
        embeds: [successEmbed('👤 User Added', `<@${user.id}> was added to this ticket by <@${interaction.user.id}>.`)],
      });

      logger.info('User added to ticket', {
        userId: interaction.user.id,
        addedUserId: user.id,
        channelId: interaction.channel.id,
        guildId: interaction.guildId,
      });
    } catch (error) {
      logger.error('Add command error:', error);
      await handleInteractionError(interaction, error, { subtype: 'add_failed' });
    }
  },
};
