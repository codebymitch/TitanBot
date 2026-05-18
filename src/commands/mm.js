/**
 * /mm Command
 * 
 * Opens a modal to create a new middleman trade ticket.
 */

import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { createTicketModal } from '../components/modals/mmModals.js';

export default {
  data: new SlashCommandBuilder()
    .setName('mm')
    .setDescription('🛡️ Create a new middleman trade ticket')
    .setDefaultMemberPermissions(PermissionFlagsBits.SendMessages)
    .setDMPermission(false),

  /**
   * Execute the /mm command
   * @param {import('discord.js').ChatInputCommandInteraction} interaction
   * @param {import('discord.js').Client} client
   */
  async execute(interaction, client) {
    try {
      // Check if user is in a guild
      if (!interaction.guild) {
        return interaction.reply({
          content: '❌ This command can only be used in a server.',
          ephemeral: true
        });
      }

      // Show the create ticket modal
      const modal = createTicketModal();
      await interaction.showModal(modal);

    } catch (error) {
      console.error('Error executing /mm command:', error);
      
      const errorMessage = {
        content: '❌ An error occurred while processing your request.',
        ephemeral: true
      };

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(errorMessage);
      } else {
        await interaction.reply(errorMessage);
      }
    }
  },

  /**
   * Auto-complete handler for /mm command (if needed in future)
   */
  async autocomplete(interaction) {
    // No autocomplete needed for this command
  }
};