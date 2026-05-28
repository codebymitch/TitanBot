import { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, MessageFlags } from 'discord.js';
import { errorEmbed, successEmbed, createEmbed } from '../utils/embeds.js';
import { WarningService } from '../services/warningService.js';
import { InteractionHelper } from '../utils/interactionHelper.js';
import { logger } from '../utils/logger.js';

const warningDeleteSpecificHandler = {
  name: 'warning_delete_specific',
  async execute(interaction, client) {
    try {
      const [, targetUserId, originalModeratorId] = interaction.customId.split(':');
      
      if (interaction.user.id !== originalModeratorId) {
        return await interaction.reply({
          embeds: [errorEmbed('❌ Permission Denied', 'Only the moderator who viewed these warnings can delete them.')],
          flags: MessageFlags.Ephemeral
        });
      }

      const modal = new ModalBuilder()
        .setCustomId(`warning_delete_modal:${targetUserId}:${interaction.user.id}`)
        .setTitle('Delete Warning');

      const warningNumberInput = new TextInputBuilder()
        .setCustomId('warning_number')
        .setLabel('Warning Number (#1, #2, etc.)')
        .setPlaceholder('Enter the warning number to delete')
        .setRequired(true)
        .setStyle(TextInputStyle.Short)
        .setMaxLength(10);

      const actionRow = new ActionRowBuilder().addComponents(warningNumberInput);
      modal.addComponents(actionRow);

      await interaction.showModal(modal);
    } catch (error) {
      logger.error('Warning delete specific button error:', error);
      await interaction.reply({
        embeds: [errorEmbed('❌ Error', 'Failed to open delete warning modal.')],
        flags: MessageFlags.Ephemeral
      });
    }
  }
};

const warningClearAllHandler = {
  name: 'warning_clear_all',
  async execute(interaction, client) {
    try {
      const [, targetUserId, originalModeratorId] = interaction.customId.split(':');
      
      if (interaction.user.id !== originalModeratorId) {
        return await interaction.reply({
          embeds: [errorEmbed('❌ Permission Denied', 'Only the moderator who viewed these warnings can clear them.')],
          flags: MessageFlags.Ephemeral
        });
      }

      const targetUser = await client.users.fetch(targetUserId).catch(() => null);
      const targetName = targetUser ? targetUser.username : 'this user';

      const clearModal = new ModalBuilder()
        .setCustomId(`warning_clear_confirm_modal:${targetUserId}:${interaction.user.id}`)
        .setTitle('Clear All Warnings')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('delete_confirmation')
              .setLabel(`Type "DELETE" to clear all warnings`)
              .setStyle(TextInputStyle.Short)
              .setPlaceholder('DELETE')
              .setMaxLength(6)
              .setMinLength(6)
              .setRequired(true)
          )
        );

      await interaction.showModal(clearModal);
    } catch (error) {
      logger.error('Warning clear all button error:', error);
      await interaction.reply({
        embeds: [errorEmbed('❌ Error', 'Failed to open confirmation modal.')],
        flags: MessageFlags.Ephemeral
      });
    }
  }
};


export {
  warningDeleteSpecificHandler,
  warningClearAllHandler
};
