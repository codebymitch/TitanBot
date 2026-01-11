import { Events } from 'discord.js';
import { logger } from '../utils/logger.js';

export default {
  name: Events.InteractionCreate,
  async execute(interaction, client) {
    try {
      // Handle chat input commands
      if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);

        if (!command) {
          logger.error(`No command matching ${interaction.commandName} was found.`);
          return;
        }

        try {
          await command.execute(interaction, client);
        } catch (error) {
          logger.error(`Error executing ${interaction.commandName}`, error);
          
          const reply = {
            content: 'There was an error while executing this command!',
            ephemeral: true
          };

          if (interaction.replied || interaction.deferred) {
            await interaction.followUp(reply);
          } else {
            await interaction.reply(reply);
          }
        }
      }
      // Handle buttons
      else if (interaction.isButton()) {
        const [customId, ...args] = interaction.customId.split(':');
        const button = client.buttons.get(customId);

        if (!button) return;

        try {
          await button.execute(interaction, client, args);
        } catch (error) {
          logger.error(`Error executing button ${customId}`, error);
          await interaction.reply({
            content: 'There was an error processing this button!',
            ephemeral: true
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
            ephemeral: true
          }).catch(console.error);
        }
      }
      // Handle modals
      else if (interaction.isModalSubmit()) {
        const [customId, ...args] = interaction.customId.split(':');
        const modal = client.modals.get(customId);

        if (!modal) return;

        try {
          await modal.execute(interaction, client, args);
        } catch (error) {
          logger.error(`Error executing modal ${customId}`, error);
          await interaction.reply({
            content: 'There was an error processing this form!',
            ephemeral: true
          }).catch(console.error);
        }
      }
    } catch (error) {
      logger.error('Unhandled error in interactionCreate:', error);
    }
  }
};
