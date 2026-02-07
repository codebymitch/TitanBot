import { Events, MessageFlags } from 'discord.js';
import { logger } from '../utils/logger.js';
import { getGuildConfig } from '../services/guildConfig.js';
import { errorEmbed } from '../utils/embeds.js';
import { handleApplicationModal } from '../commands/Community/apply.js';
import { handleApplicationButton, handleApplicationReviewModal } from '../commands/Community/app-admin.js';
import { handleInteractionError, createError, ErrorTypes } from '../utils/errorHandler.js';
import { MessageTemplates } from '../utils/messageTemplates.js';

export default {
  name: Events.InteractionCreate,
  async execute(interaction, client) {
    try {
      if (interaction.isChatInputCommand()) {
        try {
          logger.info(`Command executed: /${interaction.commandName} by ${interaction.user.tag}`);
          const command = client.commands.get(interaction.commandName);

          if (!command) {
            throw createError(
              `No command matching ${interaction.commandName} was found.`,
              ErrorTypes.CONFIGURATION,
              'Sorry, that command does not exist.',
              { commandName: interaction.commandName }
            );
          }
          

          let guildConfig = null;
          if (interaction.guild) {
            guildConfig = await getGuildConfig(client, interaction.guild.id);
            if (guildConfig?.disabledCommands?.[interaction.commandName]) {
              throw createError(
                `Command ${interaction.commandName} is disabled in this guild`,
                ErrorTypes.CONFIGURATION,
                'This command has been disabled for this server.',
                { commandName: interaction.commandName, guildId: interaction.guild.id }
              );
            }
          }

          await command.execute(interaction, guildConfig, client);
        } catch (error) {
          await handleInteractionError(interaction, error, { 
            type: 'command',
            commandName: interaction.commandName 
          });
        }
      }
      else if (interaction.isButton()) {
        if (interaction.customId.startsWith('app_approve_') || interaction.customId.startsWith('app_deny_')) {
          try {
            await handleApplicationButton(interaction);
          } catch (error) {
            await handleInteractionError(interaction, error, { 
              type: 'button',
              customId: interaction.customId,
              handler: 'application'
            });
          }
          return;
        }
        
        if (interaction.customId.startsWith('shared_todo_')) {
          const parts = interaction.customId.split('_');
const buttonType = parts.slice(0, 3).join('_');
          const listId = parts[3];
          const button = client.buttons.get(buttonType);
          
          if (button) {
            try {
              await button.execute(interaction, client, [listId]);
            } catch (error) {
              await handleInteractionError(interaction, error, { 
                type: 'button',
                customId: interaction.customId,
                handler: 'todo'
              });
            }
          } else {
            throw createError(
              `No button handler found for ${buttonType}`,
              ErrorTypes.CONFIGURATION,
              'This button is not available.',
              { buttonType }
            );
          }
          return;
        }
        
        const [customId, ...args] = interaction.customId.split(':');
        const button = client.buttons.get(customId);

        if (!button) {
          throw createError(
            `No button handler found for ${customId}`,
            ErrorTypes.CONFIGURATION,
            'This button is not available.',
            { customId }
          );
        }

        try {
          await button.execute(interaction, client, args);
        } catch (error) {
          await handleInteractionError(interaction, error, { 
            type: 'button',
            customId: interaction.customId,
            handler: 'general'
          });
        }
      }
      else if (interaction.isStringSelectMenu()) {
        const [customId, ...args] = interaction.customId.split(':');
        const selectMenu = client.selectMenus.get(customId);

        if (!selectMenu) {
          throw createError(
            `No select menu handler found for ${customId}`,
            ErrorTypes.CONFIGURATION,
            'This select menu is not available.',
            { customId }
          );
        }

        try {
          await selectMenu.execute(interaction, client, args);
        } catch (error) {
          await handleInteractionError(interaction, error, { 
            type: 'select_menu',
            customId: interaction.customId
          });
        }
      }
      else if (interaction.isModalSubmit()) {
        if (interaction.customId.startsWith('app_modal_')) {
          try {
            await handleApplicationModal(interaction);
          } catch (error) {
            await handleInteractionError(interaction, error, { 
              type: 'modal',
              customId: interaction.customId,
              handler: 'application'
            });
          }
          return;
        }
        
        if (interaction.customId.startsWith('app_review_')) {
          try {
            await handleApplicationReviewModal(interaction);
          } catch (error) {
            await handleInteractionError(interaction, error, { 
              type: 'modal',
              customId: interaction.customId,
              handler: 'application_review'
            });
          }
          return;
        }
        
        const [customId, ...args] = interaction.customId.split(':');
        const modal = client.modals.get(customId);

        if (!modal) {
          throw createError(
            `No modal handler found for ${customId}`,
            ErrorTypes.CONFIGURATION,
            'This form is not available.',
            { customId }
          );
        }

        try {
          await modal.execute(interaction, client, args);
        } catch (error) {
          await handleInteractionError(interaction, error, { 
            type: 'modal',
            customId: interaction.customId,
            handler: 'general'
          });
        }
      }
    } catch (error) {
      logger.error('Unhandled error in interactionCreate:', error);
      
      try {
        const errorMessage = {
          embeds: [MessageTemplates.ERRORS.DATABASE_ERROR('processing your interaction')],
          flags: ['Ephemeral']
        };
        
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply(errorMessage);
        } else {
          await interaction.reply(errorMessage);
        }
      } catch (replyError) {
        logger.error('Failed to send fallback error response:', replyError);
      }
    }
  }
};
