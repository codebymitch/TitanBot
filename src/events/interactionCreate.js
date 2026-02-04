import { Events, MessageFlags } from 'discord.js';
import { logger } from '../utils/logger.js';
import { getGuildConfig } from '../services/guildConfig.js';
import { errorEmbed } from '../utils/embeds.js';
import { handleApplicationModal } from '../commands/Community/apply.js';
import { handleApplicationButton, handleApplicationReviewModal } from '../commands/Community/app-admin.js';
import { InteractionHelper } from '../utils/interactionHelper.js';

export default {
  name: Events.InteractionCreate,
  async execute(interaction, client) {
    try {
      // Handle chat input commands
      if (interaction.isChatInputCommand()) {
        try {
          // Defer the reply immediately to prevent timeouts
          const deferSuccess = await InteractionHelper.safeDefer(interaction);
          if (!deferSuccess) {
            logger.warn(`Interaction ${interaction.id} defer failed, continuing without defer`);
            // Proceed without deferring; individual commands and helper functions will
            // attempt to reply or edit as needed (safeEditReply falls back to reply).
          }

          logger.info(`Command executed: /${interaction.commandName} by ${interaction.user.tag}`);
          const command = client.commands.get(interaction.commandName);

          if (!command) {
            logger.error(`No command matching ${interaction.commandName} was found.`);
            await interaction.editReply({ content: 'Sorry, that command does not exist.' });
            return;
          }

          // Check if command is disabled for this guild
          let guildConfig = null;
          if (interaction.guild) {
            guildConfig = await getGuildConfig(client, interaction.guild.id);
            if (guildConfig?.disabledCommands?.[interaction.commandName]) {
              return interaction.editReply({
                embeds: [
                  errorEmbed(
                    'This command has been disabled for this server.',
                    'Command Disabled'
                  )
                ]
              });
            }
          }

          // Always pass all arguments. The command can choose to use them or not.
          await command.execute(interaction, guildConfig, client);
        } catch (error) {
          logger.error(`Error executing ${interaction.commandName}`, error);
          
          // Only try to reply if the interaction hasn't been handled yet
          if (interaction.replied || interaction.deferred) {
            // Interaction was already acknowledged, can't reply again
            logger.debug(`Interaction ${interaction.id} already acknowledged, skipping error reply`);
            return;
          }
          
          try {
            const reply = {
              content: 'There was an error while executing this command!',
              flags: [MessageFlags.Ephemeral]
            };
            await interaction.reply(reply);
          } catch (replyError) {
            // If reply fails, try followUp as last resort
            if (!replyError.message?.includes('already been acknowledged')) {
              logger.error('Failed to reply to interaction:', replyError);
            }
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
