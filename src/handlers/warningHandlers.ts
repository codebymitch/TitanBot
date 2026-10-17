import { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, MessageFlags } from 'discord.js';
import type { ModalSubmitInteraction } from 'discord.js';
import type { ButtonHandler, ModalHandler, NexoClient } from '../types/index.js';
import { successEmbed } from '../utils/embeds.js';
import { WarningService } from '../services/moderation/warningService.js';
import { InteractionHelper } from '../utils/interactionHelper.js';
import { logger } from '../utils/logger.js';

import { replyUserError, ErrorTypes } from '../utils/errorHandler.js';
const warningDeleteSpecificHandler = {
  name: 'warning_delete_specific',
  async execute(interaction, client) {
    try {
      const [, targetUserId, originalModeratorId] = interaction.customId.split(':');
      
      if (interaction.user.id !== originalModeratorId) {
        return await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: 'Nur der Moderator, der diese Verwarnungen aufgerufen hat, kann sie löschen.' });
      }

      const modal = new ModalBuilder()
        .setCustomId(`warning_delete_modal:${targetUserId}:${interaction.user.id}`)
        .setTitle('Verwarnung löschen');

      const warningNumberInput = new TextInputBuilder()
        .setCustomId('warning_number')
        .setLabel('Nummer der Verwarnung (#1, #2 usw.)')
        .setPlaceholder('Nummer der zu löschenden Verwarnung')
        .setRequired(true)
        .setStyle(TextInputStyle.Short)
        .setMaxLength(10);

      const actionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(warningNumberInput);
      modal.addComponents(actionRow);

      await interaction.showModal(modal);
    } catch (error) {
      logger.error('Warning delete specific button error:', error);
      await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Das Formular zum Löschen der Verwarnung konnte nicht geöffnet werden.' });
    }
  }
} satisfies ButtonHandler;

const warningClearAllHandler = {
  name: 'warning_clear_all',
  async execute(interaction, client) {
    try {
      const [, targetUserId, originalModeratorId] = interaction.customId.split(':');
      
      if (interaction.user.id !== originalModeratorId) {
        return await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: 'Nur der Moderator, der diese Verwarnungen aufgerufen hat, kann sie zurücksetzen.' });
      }

      const targetUser = await client.users.fetch(targetUserId).catch(() => null);
      const targetName = targetUser ? targetUser.username : 'diesen Nutzer';

      const clearModal = new ModalBuilder()
        .setCustomId(`warning_clear_confirm_modal:${targetUserId}:${interaction.user.id}`)
        .setTitle('Alle Verwarnungen löschen')
        .addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId('delete_confirmation')
              .setLabel(`Gib „DELETE“ ein, um alle zu löschen`)
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
      await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Das Bestätigungsformular konnte nicht geöffnet werden.' });
    }
  }
} satisfies ButtonHandler;

async function warningDeleteModalHandler(interaction: ModalSubmitInteraction, client: NexoClient): Promise<unknown> {
  try {
    const [, targetUserId, originalModeratorId] = interaction.customId.split(':');
    
    if (interaction.user.id !== originalModeratorId) {
      return await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: 'Nur der ursprüngliche Moderator kann Verwarnungen löschen.' });
    }

    const warningNumberInput = interaction.fields.getTextInputValue('warning_number');
    const warningNumber = parseInt(warningNumberInput.replace('#', '').trim(), 10);

    if (isNaN(warningNumber) || warningNumber < 1) {
      return await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: 'Bitte gib eine gültige Verwarnungsnummer ein (z. B. 1, 2, 3).' });
    }

    const deferSuccess = await InteractionHelper.safeDefer(interaction);
    if (!deferSuccess) return;

    const guildId = interaction.guildId!;
    const warnings = await WarningService.getWarnings(guildId, targetUserId);

    if (warningNumber > warnings.length) {
      return await replyUserError(interaction, { type: ErrorTypes.USER_INPUT, message: `Verwarnung #${warningNumber} gibt es nicht. Dieser Nutzer hat nur ${warnings.length} Verwarnung(en).` });
    }

    const warningToDelete = warnings[warningNumber - 1];
    await WarningService.removeWarning(guildId, targetUserId, warningToDelete.id);

    const targetUser = await client.users.fetch(targetUserId).catch(() => null);
    const targetName = targetUser ? targetUser.username : 'den Nutzer';

    logger.info(`[MODERATION] Warning deleted for ${targetUserId} in ${guildId} by ${interaction.user.id}`, {
      warningId: warningToDelete.id,
      reason: warningToDelete.reason,
      warningNumber
    });

    await interaction.editReply({
      embeds: [successEmbed('✅ Verwarnung gelöscht', `Verwarnung #${warningNumber} für **${targetName}** wurde gelöscht.\n\n**Grund war:** ${warningToDelete.reason.substring(0, 100)}`)]
    });
  } catch (error) {
    logger.error('Warning delete modal handler error:', error);
    await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Die Verwarnung konnte nicht gelöscht werden.' });
  }
}

async function warningClearConfirmModalHandler(interaction: ModalSubmitInteraction, client: NexoClient): Promise<unknown> {
  try {
    const [, targetUserId, originalModeratorId] = interaction.customId.split(':');
    
    if (interaction.user.id !== originalModeratorId) {
      return await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: 'Nur der ursprüngliche Moderator kann Verwarnungen zurücksetzen.' });
    }

    const confirmation = interaction.fields.getTextInputValue('delete_confirmation').trim();

    if (confirmation !== 'DELETE') {
      return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Du musst genau „DELETE“ eingeben, um das Löschen aller Verwarnungen zu bestätigen.' });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const guildId = interaction.guildId!;
    const { count } = await WarningService.clearWarnings(guildId, targetUserId);

    const targetUser = await client.users.fetch(targetUserId).catch(() => null);
    const targetName = targetUser ? targetUser.username : 'den Nutzer';

    logger.info(`[MODERATION] All warnings cleared for ${targetUserId} in ${guildId} by ${interaction.user.id}`);

    await interaction.editReply({
      embeds: [successEmbed('✅ Verwarnungen gelöscht', `Alle Verwarnungen für **${targetName}** wurden gelöscht. **${count}** Verwarnung(en) entfernt.`)]
    });
  } catch (error) {
    logger.error('Warning clear confirm modal handler error:', error);
    if (!interaction.replied && !interaction.deferred) {
      await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Die Verwarnungen konnten nicht gelöscht werden.' });
    } else {
      await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Die Verwarnungen konnten nicht gelöscht werden.' });
    }
  }
}

export {
  warningDeleteSpecificHandler,
  warningClearAllHandler,
  warningDeleteModalHandler,
  warningClearConfirmModalHandler,
};

export default {
  name: 'warning_delete_modal',
  execute: warningDeleteModalHandler
} satisfies ModalHandler;
