import { Events, MessageFlags } from 'discord.js';
import { logger } from '../utils/logger.js';
import { getGuildConfig } from '../services/guildConfig.js';
import { errorEmbed } from '../utils/embeds.js';
import { handleApplicationModal } from '../commands/Community/apply.js';
import { handleApplicationButton, handleApplicationReviewModal } from '../commands/Community/app-admin.js';

export default {
  name: Events.InteractionCreate,
  async execute(interaction, client) {
    try {
      // Handle chat input commands
      if (interaction.isChatInputCommand()) {
        try {
          logger.info(`Command executed: /${interaction.commandName} by ${interaction.user.tag}`);
          const command = client.commands.get(interaction.commandName);

          if (!command) {
            logger.error(`No command matching ${interaction.commandName} was found.`);
            try {
              await interaction.reply({ 
                content: 'Sorry, that command does not exist.',
                flags: MessageFlags.Ephemeral
              });
            } catch (error) {
              logger.error('Failed to reply to unknown command:', error);
            }
            return;
          }
          
          // Note: Each command is now responsible for its own deferring
          // No global deferring here to avoid conflicts

          // Check if command is disabled for this guild
          let guildConfig = null;
          if (interaction.guild) {
            guildConfig = await getGuildConfig(client, interaction.guild.id);
            if (guildConfig?.disabledCommands?.[interaction.commandName]) {
              await interaction.reply({
                embeds: [
                  errorEmbed(
                    'This command has been disabled for this server.',
                    'Command Disabled'
                  )
                ],
                flags: MessageFlags.Ephemeral
              });
              return;
            }
          }

          // Execute the command
          await command.execute(interaction, guildConfig, client);
        } catch (error) {
          logger.error(`Error executing ${interaction.commandName}`, error);
          
          const errorMessage = {
            embeds: [errorEmbed('Command Error', 'There was an error while executing this command!')],
            flags: MessageFlags.Ephemeral
          };
          
          // Handle based on interaction state
          if (interaction.deferred || interaction.replied) {
            await interaction.editReply(errorMessage);
          } else {
            await interaction.reply(errorMessage);
          }
        }
      }
      // Handle buttons
      else if (interaction.isButton()) {
        // Handle application buttons first
        if (interaction.customId.startsWith('app_approve_') || interaction.customId.startsWith('app_deny_')) {
          try {
            await handleApplicationButton(interaction);
          } catch (error) {
            logger.error(`Error handling application button ${interaction.customId}`, error);
            await interaction.reply({
              content: 'There was an error processing this button!',
              flags: [MessageFlags.Ephemeral]
            }).catch(console.error);
          }
          return;
        }
        
        // Handle todo buttons which use underscore separator
        if (interaction.customId.startsWith('shared_todo_')) {
          const parts = interaction.customId.split('_');
          const buttonType = parts.slice(0, 3).join('_'); // shared_todo_add or shared_todo_complete
          const listId = parts[3];
          const button = client.buttons.get(buttonType);
          
          if (button) {
            try {
              await button.execute(interaction, client, [listId]);
            } catch (error) {
              logger.error(`Error executing button ${buttonType}`, error);
              await interaction.reply({
                content: 'There was an error processing this button!',
                flags: [MessageFlags.Ephemeral]
              }).catch(console.error);
            }
          }
          return;
        }
        
        // Handle regular buttons with colon separator
        const [customId, ...args] = interaction.customId.split(':');
        const button = client.buttons.get(customId);

        if (!button) return;

        try {
          await button.execute(interaction, client, args);
        } catch (error) {
          logger.error(`Error executing button ${customId}`, error);
          await interaction.reply({
            content: 'There was an error processing this button!',
            flags: [MessageFlags.Ephemeral]
          }).catch(console.error);
        }
      }
      // Handle select menus
      else if (interaction.isStringSelectMenu()) {
        const [customId, ...args] = interaction.customId.split(':');
        const selectMenu = client.selectMenus.get(customId);

        if (!selectMenu) return;

        try {
          await selectMenu.execute(interaction, client, args);
        } catch (error) {
          logger.error(`Error executing select menu ${customId}`, error);
          await interaction.reply({
            content: 'There was an error processing this selection!',
            flags: [MessageFlags.Ephemeral]
          }).catch(console.error);
        }
      }
      // Handle modals
      else if (interaction.isModalSubmit()) {
        // Handle application modals first
        if (interaction.customId.startsWith('app_modal_')) {
          try {
            await handleApplicationModal(interaction);
          } catch (error) {
            logger.error(`Error handling application modal ${interaction.customId}`, error);
            await interaction.reply({
              content: 'There was an error processing this form!',
              flags: [MessageFlags.Ephemeral]
            }).catch(console.error);
          }
          return;
        }
        
        // Handle application review modals
        if (interaction.customId.startsWith('app_review_')) {
          try {
            await handleApplicationReviewModal(interaction);
          } catch (error) {
            logger.error(`Error handling application review modal ${interaction.customId}`, error);
            await interaction.reply({
              content: 'There was an error processing this form!',
              flags: [MessageFlags.Ephemeral]
            }).catch(console.error);
          }
          return;
        }
        
        // Handle regular modals with colon separator (this includes shared_todo modals)
        const [customId, ...args] = interaction.customId.split(':');
        const modal = client.modals.get(customId);

        if (!modal) return;

        try {
          await modal.execute(interaction, client, args);
        } catch (error) {
          logger.error(`Error executing modal ${customId}`, error);
          await interaction.reply({
            content: 'There was an error processing this form!',
            flags: [MessageFlags.Ephemeral]
          }).catch(console.error);
        }
      }
    } catch (error) {
      logger.error('Unhandled error in interactionCreate:', error);
    }
  }
};
