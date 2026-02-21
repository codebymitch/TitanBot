import { MessageFlags } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed } from '../utils/embeds.js';
import { performDeletionByCounterId } from '../commands/Counter/modules/counter_delete.js';
import { logger } from '../utils/logger.js';

export const counterDeleteActionHandler = {
  name: 'counter-delete',
  async execute(interaction, client, args = []) {
    try {
      // Defer update immediately to ensure interaction is acknowledged
      try {
        await interaction.deferUpdate();
      } catch (error) {
        logger.error("Failed to defer button interaction:", error);
        return;
      }

      const [action, counterId, ownerId] = args;

      if (!interaction.inGuild()) {
        await interaction.editReply({
          embeds: [errorEmbed('Guild Only', 'This action can only be used in a server.')],
          components: []
        }).catch(logger.error);
        return;
      }

      if (!action || !counterId) {
        await interaction.editReply({
          embeds: [errorEmbed('Invalid Action', 'Counter delete action data is missing.')],
          components: []
        }).catch(logger.error);
        return;
      }

      if (ownerId && interaction.user.id !== ownerId) {
        await interaction.editReply({
          embeds: [errorEmbed('Not Allowed', 'Only the user who initiated this deletion can use these buttons.')],
          components: []
        }).catch(logger.error);
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
        await interaction.editReply({
          embeds: [errorEmbed('Invalid Action', 'Unknown counter delete action.')],
          components: []
        }).catch(logger.error);
        return;
      }

      const result = await performDeletionByCounterId(client, interaction.guild, counterId);

      if (!result.success) {
        await interaction.editReply({
          embeds: [errorEmbed(result.message)],
          components: []
        }).catch(logger.error);
        return;
      }

      await interaction.editReply({
        embeds: [successEmbed(result.message)],
        components: []
      }).catch(logger.error);
    } catch (error) {
      logger.error('Error handling counter-delete button:', error);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          embeds: [errorEmbed('Error', 'An error occurred while processing this action.')],
          flags: MessageFlags.Ephemeral
        }).catch(() => null);
      } else {
        await interaction.editReply({
          embeds: [errorEmbed('Error', 'An error occurred while processing this action.')],
          components: []
        }).catch(() => null);
      }
    }
  }
};

export default counterDeleteActionHandler;
