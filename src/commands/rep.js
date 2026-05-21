/**
 * /rep Command
 * 
 * Give reputation to a user based on trade experience.
 * Can only be used by participants of a completed trade.
 */

import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
// import { getTicketByChannel, getTicketById } from '../utils/createTicket.js';
// import Reputation from '../models/Reputation.js';
// import { canGiveReputation, validatePermission } from '../utils/mmPermissions.js';
// import { connectMongoDB } from '../database/mongoose.js';
// import { createReputationEmbed } from '../utils/mmEmbeds.js';

export default {
  data: new SlashCommandBuilder()
    .setName('rep')
    .setDescription('📊 Give reputation to a trader')
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('The user to give reputation to')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('type')
        .setDescription('The type of reputation')
        .setRequired(true)
        .addChoices(
          { name: '✅ Positive', value: 'positive' },
          { name: '❌ Negative', value: 'negative' },
          { name: '⚪ Neutral', value: 'neutral' }
        )
    )
    .addStringOption(option =>
      option
        .setName('comment')
        .setDescription('Optional comment about the trade')
        .setRequired(false)
        .setMaxLength(500)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.SendMessages)
    .setDMPermission(false),

  /**
   * Execute the /rep command
   * @param {import('discord.js').ChatInputCommandInteraction} interaction
   * @param {import('discord.js').Client} client
   */
  async execute(interaction, client) {
    try {
      // Defer the reply
      await interaction.deferReply({ ephemeral: false });

      return interaction.editReply({
        content: '❌ Este comando não está disponível no momento.'
      });

      // TODO: Implementar sistema de reputação quando módulos necessários forem restaurados
      /*
      if (!interaction.guild) {
        return interaction.editReply({
          content: '❌ This command can only be used in a server.'
        });
      }

      const targetUser = interaction.options.getUser('user', true);
      const repType = interaction.options.getString('type', true);
      const comment = interaction.options.getString('comment') || '';

      // Connect to MongoDB
      await connectMongoDB();

      // Find a completed ticket where both users participated
      let ticket = null;
      
      if (interaction.channel) {
        // First, check if there's a ticket in the current channel
        ticket = await getTicketByChannel(interaction.channel.id);
        
        // If no ticket in current channel or ticket isn't completed, search for completed trades
        if (!ticket || !ticket.tradeSuccessful) {
          // Search for completed tickets between these users
          const tickets = await interaction.client.models?.Ticket?.find({
            guildId: interaction.guild.id,
            tradeSuccessful: true,
            $or: [
              { buyerId: interaction.user.id },
              { sellerId: interaction.user.id }
            ],
            $or: [
              { buyerId: targetUser.id },
              { sellerId: targetUser.id }
            ]
          }).sort({ closedAt: -1 }).limit(1);
          
          ticket = tickets && tickets.length > 0 ? tickets[0] : null;
        }
      }

      if (!ticket) {
        return interaction.editReply({
          content: '❌ Could not find a completed trade between you and the specified user. ' +
                   'Reputation can only be given for completed trades you both participated in.'
        });
      }

      // Check if ticket is completed
      if (!ticket.tradeSuccessful) {
        return interaction.editReply({
          content: '❌ Reputation can only be given for successful trades.'
        });
      }

      // Check if user can give reputation
      const member = await interaction.guild.members.fetch(interaction.user.id);
      
      try {
        validatePermission(member, ticket, 'give_reputation');
      } catch (error) {
        return interaction.editReply({
          content: `❌ ${error.message}`
        });
      }

      // Check if target user is a participant
      if (targetUser.id !== ticket.buyerId && targetUser.id !== ticket.sellerId) {
        return interaction.editReply({
          content: '❌ The specified user was not a participant in this trade.'
        });
      }

      // Check if user is giving rep to themselves
      if (targetUser.id === interaction.user.id) {
        return interaction.editReply({
          content: '❌ You cannot give reputation to yourself.'
        });
      }

      // Get or create reputation for the target user
      const targetRep = await Reputation.getOrCreate(targetUser.id, interaction.guild.id);
      
      // Add the reputation
      await targetRep.addReputation(
        interaction.user.id,
        repType,
        ticket._id.toString(),
        comment
      );

      // Get updated reputation summary
      const summary = targetRep.getSummary();

      // Create the reputation embed
      const repEmbed = createReputationEmbed({
        user: targetUser.toString(),
        givenBy: interaction.user.toString(),
        type: repType,
        comment,
        tradeCount: summary.successfulTrades + summary.cancelledTrades,
        successRate: summary.successRate
      });

      // Send the reputation message
      await interaction.editReply({
        content: `📊 **Reputation Given**\n` +
                 `${interaction.user.toString()} gave ${repType} reputation to ${targetUser.toString()}`,
        embeds: [repEmbed]
      });

      // Log the reputation change
      const { logTicketAction } = await import('../utils/createTicket.js');
      await logTicketAction(interaction.guild, 'reputation_given', {
        ticketId: ticket._id,
        from: interaction.user.tag,
        to: targetUser.tag,
        type: repType,
        comment: comment || 'No comment'
      });
      */

    } catch (error) {
      console.error('Error executing /rep command:', error);
      
      const errorMessage = '❌ An error occurred while processing the reputation.';
      
      if (interaction.replied || interaction.deferred) {
        try {
          await interaction.editReply({ content: errorMessage });
        } catch {
          await interaction.followUp({ content: errorMessage, ephemeral: true });
        }
      } else {
        await interaction.reply({ content: errorMessage, ephemeral: true });
      }
    }
  }
};