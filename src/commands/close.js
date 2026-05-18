/**
 * /close Command
 * 
 * Closes the current middleman ticket and generates a transcript.
 * Can only be used by staff members.
 */

import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { getTicketByChannel } from '../utils/createTicket.js';
import { closeTicket } from '../utils/createTranscript.js';
import { canCloseTickets, validatePermission } from '../utils/mmPermissions.js';
import { connectMongoDB } from '../database/mongoose.js';

export default {
  data: new SlashCommandBuilder()
    .setName('close')
    .setDescription('🔒 Close the current middleman ticket')
    .addStringOption(option =>
      option
        .setName('status')
        .setDescription('The outcome of the trade')
        .setRequired(false)
        .addChoices(
          { name: '✅ Successful Trade', value: 'successful' },
          { name: '❌ Cancelled Trade', value: 'cancelled' }
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .setDMPermission(false),

  /**
   * Execute the /close command
   * @param {import('discord.js').ChatInputCommandInteraction} interaction
   * @param {import('discord.js').Client} client
   */
  async execute(interaction, client) {
    try {
      // Defer the reply since this may take a moment
      await interaction.deferReply({ ephemeral: true });

      // Check if user is in a guild
      if (!interaction.guild) {
        return interaction.editReply({
          content: '❌ This command can only be used in a server.'
        });
      }

      // Check if user has permission to close tickets
      const member = await interaction.guild.members.fetch(interaction.user.id);
      if (!canCloseTickets(member)) {
        return interaction.editReply({
          content: '❌ Only staff members can close tickets.'
        });
      }

      // Check if the channel is a ticket channel
      if (!interaction.channel) {
        return interaction.editReply({
          content: '❌ Could not determine the current channel.'
        });
      }

      // Connect to MongoDB
      await connectMongoDB();

      // Get the ticket from database
      const ticket = await getTicketByChannel(interaction.channel.id);
      
      if (!ticket) {
        return interaction.editReply({
          content: '❌ This channel is not a middleman ticket.'
        });
      }

      // Check if ticket is already closed
      if (ticket.closedAt) {
        return interaction.editReply({
          content: '❌ This ticket has already been closed.'
        });
      }

      // Get the trade status from the option
      const statusOption = interaction.options.getString('status');
      const tradeSuccessful = statusOption !== 'cancelled';

      // Validate permission
      try {
        validatePermission(member, ticket, 'close');
      } catch (error) {
        return interaction.editReply({
          content: `❌ ${error.message}`
        });
      }

      // Close the ticket
      const result = await closeTicket({
        channel: interaction.channel,
        ticket,
        closedBy: interaction.user,
        tradeSuccessful,
        deleteChannel: true
      });

      if (result.success) {
        // Don't send a message since the channel will be deleted
        // The closeTicket function already sends messages to the channel
      }

    } catch (error) {
      console.error('Error executing /close command:', error);
      
      const errorMessage = '❌ An error occurred while closing the ticket.';
      
      if (interaction.replied || interaction.deferred) {
        try {
          await interaction.editReply({ content: errorMessage });
        } catch {
          // Channel might have been deleted
        }
      } else {
        await interaction.reply({ content: errorMessage, ephemeral: true });
      }
    }
  }
};