// events/interactionCreate.js

import { Events, MessageFlags } from 'discord.js';
import { logger } from '../utils/logger.js';
import { ResponseCoordinator } from '../utils/responseCoordinator.js';
import { InteractionHelper } from '../utils/interactionHelper.js';
import { handleInteractionError } from '../utils/errorHandler.js';

let cachedMusicComponentHandler;
let checkedMusicComponentHandler = false;

async function getMusicComponentHandler() {
  if (checkedMusicComponentHandler) return cachedMusicComponentHandler;
  checkedMusicComponentHandler = true;

  try {
    const musicModule = await import('../services/music/music.js');
    if (typeof musicModule.handleMusicComponent === 'function') {
      cachedMusicComponentHandler = musicModule.handleMusicComponent;
    }
  } catch (error) {
    logger.warn(`⚠️  Music component handler unavailable (../services/music/music.js): ${error.message}`);
  }

  return cachedMusicComponentHandler;
}

export default {
  name: Events.InteractionCreate,
  async execute(interaction, client) {
    if (!interaction) return;

    ResponseCoordinator.attach(interaction);
    InteractionHelper.patchInteractionResponses(interaction);

    try {
      if (interaction.isChatInputCommand()) {
        // Defer publicly for /play so Now Playing / queued embeds are visible in channel
        if (interaction.commandName === 'play' && !interaction.deferred && !interaction.replied) {
          await InteractionHelper.safeDefer(interaction);
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
          const handleMusicComponent = await getMusicComponentHandler();
          if (handleMusicComponent) {
            const handled = await handleMusicComponent(interaction, client);
            if (handled) return;
          }

          const musicCommand = client.commands?.get('music') || client.commands?.get('play');
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
