// events/interactionCreate.js

import { Events, MessageFlags } from 'discord.js';
import { logger } from '../utils/logger.js';
import { ResponseCoordinator } from '../utils/responseCoordinator.js';
import { InteractionHelper } from '../utils/interactionHelper.js';
import { handleInteractionError } from '../utils/errorHandler.js';

export default {
  name: Events.InteractionCreate,
  async execute(interaction, client) {
    if (!interaction) return;

    ResponseCoordinator.attach(interaction);
    InteractionHelper.patchInteractionResponses(interaction);

    try {
      if (interaction.isChatInputCommand()) {
        // Acknowledge immediately for music commands so Discord never times out
        if (interaction.commandName === 'play' && !interaction.deferred && !interaction.replied) {
          await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
        }

        const command = client.commands?.get(interaction.commandName);
        if (!command) {
          await InteractionHelper.safeReply(interaction, {
            content: '❌ هذا الأمر غير متاح حالياً.',
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        await command.execute(interaction, client);
        return;
      }

      if (interaction.isAutocomplete()) {
        const command = client.commands?.get(interaction.commandName);
        if (command?.autocomplete) {
          await command.autocomplete(interaction, client);
        }
        return;
      }

      if (interaction.isButton() || interaction.isStringSelectMenu() || interaction.isModalSubmit()) {
        if (interaction.customId?.startsWith('music_')) {
          const musicCommand = client.commands?.get('play') || client.commands?.get('music');
          if (musicCommand?.handleComponent) {
            await musicCommand.handleComponent(interaction, client);
          }
        }
      }
    } catch (error) {
      logger.error('Unhandled error in interactionCreate:', error);
      await handleInteractionError(interaction, error, {
        source: 'events/interactionCreate.js',
        command: interaction.commandName || interaction.customId,
      });
    }
  },
};
