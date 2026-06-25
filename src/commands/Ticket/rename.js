import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { handleInteractionError, replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
import { getTicketPermissionContext } from '../../utils/ticketPermissions.js';

export default {
  data: new SlashCommandBuilder()
    .setName('rename')
    .setDescription('Rename the current ticket channel')
    .addStringOption(opt =>
      opt.setName('name')
        .setDescription('New name for the ticket channel')
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
        return await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: 'You need the Ticket Staff Role to rename tickets.' });
      }

      const newName = interaction.options.getString('name')
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '');

      if (!newName) {
        return await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: 'Invalid channel name. Use letters, numbers, and hyphens only.' });
      }

      const oldName = interaction.channel.name;
      await interaction.channel.setName(newName);

      await InteractionHelper.safeEditReply(interaction, {
        embeds: [successEmbed('✅ Ticket Renamed', `Channel renamed from \`${oldName}\` to \`${newName}\`.`)],
      });

      await interaction.channel.send({
        embeds: [successEmbed('📝 Ticket Renamed', `This ticket was renamed to \`${newName}\` by <@${interaction.user.id}>.`)],
      });

      logger.info('Ticket renamed', {
        userId: interaction.user.id,
        channelId: interaction.channel.id,
        oldName,
        newName,
        guildId: interaction.guildId,
      });
    } catch (error) {
      logger.error('Rename command error:', error);
      await handleInteractionError(interaction, error, { subtype: 'rename_failed' });
    }
  },
};
