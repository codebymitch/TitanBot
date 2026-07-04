import { MessageFlags } from 'discord.js';
import { createEmbed, successEmbed } from '../utils/embeds.js';
import { performDeletionByCounterId } from '../commands/ServerStats/modules/serverstats_delete.js';
import { logger } from '../utils/logger.js';
import { ErrorTypes, replyUserError } from '../utils/errorHandler.js';

export const counterDeleteActionHandler = {
  name: 'counter-delete',
  async execute(interaction, client, args = []) {
    try {
      
      try {
        await interaction.deferUpdate();
      } catch (error) {
        logger.error("Failed to defer button interaction:", error);
        return;
      }

      const [action, counterId, ownerId] = args;

      if (!interaction.inGuild()) {
        await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'This action can only be used in a server.' }).catch(logger.error);
        return;
      }

      if (!action || !counterId) {
        await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: 'Counter delete action data is missing.' }).catch(logger.error);
        return;
      }

      if (ownerId && interaction.user.id !== ownerId) {
        await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Only the user who initiated this deletion can use these buttons.' }).catch(logger.error);
        return;
      }

      if (action === 'cancel') {
        await interaction.editReply({
          embeds: [createEmbed({
            title: '❌ Cancelled',
            description: 'Counter deletion cancelled.',
            color: 'error'
          })],
          components: []
        }).catch(logger.error);
        return;
      }

      if (action !== 'confirm') {
        await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: 'Unknown counter delete action.' }).catch(logger.error);
        return;
      }

      const result = await performDeletionByCounterId(client, interaction.guild, counterId);

      if (!result.success) {
        await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: result.message }).catch(logger.error);
        return;
      }

      await interaction.editReply({
        embeds: [successEmbed(result.message)],
        components: []
      }).catch(logger.error);
    } catch (error) {
      logger.error('Error handling counter-delete button:', error);
      if (!interaction.replied && !interaction.deferred) {
        await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'An error occurred while processing this action.' }).catch(() => null);
      } else {
        await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'An error occurred while processing this action.' }).catch(() => null);
      }
    }
  }
};

export default counterDeleteActionHandler;