/**
 * Middleman Interactions Handler
 * 
 * Handles all button clicks and modal submissions for the MM system.
 */

import { ButtonCustomIds } from '../components/buttons/mmButtons.js';
import { ModalCustomIds, parseCreateTicketModal, parseReputationModal } from '../components/modals/mmModals.js';
import { createTicket, getTicketByChannel, logTicketAction } from '../utils/createTicket.js';
import { closeTicket } from '../utils/createTranscript.js';
import { canManageTickets, canCloseTickets, canUpdateStatus, validatePermission } from '../utils/mmPermissions.js';
import { createStatusEmbed, createTicketInfoEmbed, createReputationEmbed } from '../utils/mmEmbeds.js';
import Ticket from '../models/Ticket.js';
import Reputation from '../models/Reputation.js';
import mmConfig from '../config/mmConfig.js';
import { connectMongoDB } from '../database/mongoose.js';
import { logger } from '../utils/logger.js';

/**
 * Initialize the MM interactions handler
 * @param {import('discord.js').Client} client
 */
async function initMmInteractions(client) {
  // Ensure MongoDB is connected
  await connectMongoDB();

  logger.info('✅ Middleman interactions handler initialized');
}

/**
 * Handle button interactions
 * @param {import('discord.js').ButtonInteraction} interaction
 * @param {import('discord.js').Client} client
 */
async function handleButtonInteraction(interaction, client) {
  const customId = interaction.customId;

  try {
    // Check if it's an MM button
    if (!customId.startsWith('mm_')) {
      return false;
    }

    // Defer the reply to prevent timeout
    await interaction.deferUpdate();

    // Get the ticket from the channel
    const ticket = await getTicketByChannel(interaction.channel.id);

    // Handle different button types
    switch (customId) {
      // Status buttons
      case ButtonCustomIds.STATUS_WAITING_PAYMENT:
      case ButtonCustomIds.STATUS_PAYMENT_RECEIVED:
      case ButtonCustomIds.STATUS_ITEM_DELIVERED:
      case ButtonCustomIds.STATUS_TRADE_COMPLETED:
      case ButtonCustomIds.STATUS_CANCEL_TRADE:
        await handleStatusButton(interaction, ticket, customId, client);
        break;

      // Close ticket button
      case ButtonCustomIds.CLOSE_TICKET:
        await handleCloseButton(interaction, ticket, client);
        break;

      // Claim ticket button
      case ButtonCustomIds.CLAIM_TICKET:
        await handleClaimButton(interaction, ticket, client);
        break;

      // Ticket info button
      case ButtonCustomIds.SHOW_TICKET_INFO:
        await handleInfoButton(interaction, ticket, client);
        break;

      // Reputation buttons
      case ButtonCustomIds.GIVE_POSITIVE_REP:
      case ButtonCustomIds.GIVE_NEGATIVE_REP:
        await handleReputationButton(interaction, ticket, customId, client);
        break;

      default:
        logger.warn(`Unknown MM button clicked: ${customId}`);
    }

    return true;

  } catch (error) {
    logger.error('Error handling MM button interaction:', error);
    
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ 
        content: '❌ An error occurred while processing your action.', 
        ephemeral: true 
      });
    }
  }

  return false;
}

/**
 * Handle status button clicks
 */
async function handleStatusButton(interaction, ticket, customId, client) {
  if (!ticket) {
    await interaction.followUp({ 
      content: '❌ This is not a valid middleman ticket channel.', 
      ephemeral: true 
    });
    return;
  }

  // Check if ticket is already closed
  if (ticket.closedAt) {
    await interaction.followUp({ 
      content: '❌ This ticket has already been closed.', 
      ephemeral: true 
    });
    return;
  }

  // Get member and check permissions
  const member = await interaction.guild.members.fetch(interaction.user.id);
  
  try {
    validatePermission(member, ticket, 'update_status');
  } catch (error) {
    await interaction.followUp({ 
      content: `❌ ${error.message}`, 
      ephemeral: true 
    });
    return;
  }

  // Map button custom ID to status
  const statusMap = {
    [ButtonCustomIds.STATUS_WAITING_PAYMENT]: 'waiting_payment',
    [ButtonCustomIds.STATUS_PAYMENT_RECEIVED]: 'payment_received',
    [ButtonCustomIds.STATUS_ITEM_DELIVERED]: 'item_delivered',
    [ButtonCustomIds.STATUS_TRADE_COMPLETED]: 'trade_completed',
    [ButtonCustomIds.STATUS_CANCEL_TRADE]: 'cancelled'
  };

  const newStatus = statusMap[customId];
  if (!newStatus) {
    await interaction.followUp({ 
      content: '❌ Invalid status.', 
      ephemeral: true 
    });
    return;
  }

  // Update ticket status
  await ticket.updateStatus(newStatus, interaction.user.id);

  // Update reputation based on final status
  if (newStatus === 'trade_completed' || newStatus === 'cancelled') {
    const buyerRep = await Reputation.getOrCreate(ticket.buyerId, ticket.guildId);
    const sellerRep = await Reputation.getOrCreate(ticket.sellerId, ticket.guildId);
    
    if (newStatus === 'trade_completed') {
      await buyerRep.addSuccessfulTrade();
      await sellerRep.addSuccessfulTrade();
    } else {
      await buyerRep.addCancelledTrade();
      await sellerRep.addCancelledTrade();
    }
  }

  // Update the status embed
  const statusEmbed = createStatusEmbed(newStatus, {
    product: ticket.product,
    value: ticket.value,
    ticketNumber: ticket._id.toString().slice(-8).toUpperCase()
  }, interaction.user.tag);

  // Edit the original status message
  const messages = await interaction.channel.messages.fetch({ limit: 10 });
  const statusMessage = messages.find(m => 
    m.embeds.length > 0 && 
    m.embeds[0].title === '📊 Trade Status Control'
  );

  if (statusMessage) {
    await statusMessage.edit({
      embeds: [statusEmbed],
      components: interaction.message.components // Keep the same buttons
    });
  }

  // Log the status change
  await logTicketAction(interaction.guild, 'status_changed', {
    ticketId: ticket._id,
    ticketNumber: ticket._id.toString().slice(-8).toUpperCase(),
    newStatus: mmConfig.statusLabels[newStatus] || newStatus,
    changedBy: interaction.user.tag,
    channel: interaction.channel.name
  });

  await interaction.followUp({ 
    content: `✅ Status updated to **${mmConfig.statusLabels[newStatus]}**`, 
    ephemeral: false 
  });
}

/**
 * Handle close button clicks
 */
async function handleCloseButton(interaction, ticket, client) {
  if (!ticket) {
    await interaction.followUp({ 
      content: '❌ This is not a valid middleman ticket channel.', 
      ephemeral: true 
    });
    return;
  }

  // Check if ticket is already closed
  if (ticket.closedAt) {
    await interaction.followUp({ 
      content: '❌ This ticket has already been closed.', 
      ephemeral: true 
    });
    return;
  }

  // Check permissions (only staff can close)
  const member = await interaction.guild.members.fetch(interaction.user.id);
  
  if (!canCloseTickets(member)) {
    await interaction.followUp({ 
      content: '❌ Only staff members can close tickets.', 
      ephemeral: true 
    });
    return;
  }

  // Determine trade success based on current status
  const tradeSuccessful = ticket.status === 'trade_completed';

  // Close the ticket
  await closeTicket({
    channel: interaction.channel,
    ticket,
    closedBy: interaction.user,
    tradeSuccessful,
    deleteChannel: true
  });
}

/**
 * Handle claim ticket button clicks
 */
async function handleClaimButton(interaction, ticket, client) {
  if (!ticket) {
    await interaction.followUp({ 
      content: '❌ This is not a valid middleman ticket channel.', 
      ephemeral: true 
    });
    return;
  }

  // Check if user is a middleman
  const member = await interaction.guild.members.fetch(interaction.user.id);
  
  if (!canManageTickets(member)) {
    await interaction.followUp({ 
      content: '❌ Only middlemen or staff can claim tickets.', 
      ephemeral: true 
    });
    return;
  }

  // Check if already claimed
  if (ticket.middlemanId) {
    await interaction.followUp({ 
      content: `ℹ️ This ticket is already claimed by <@${ticket.middlemanId}>.`, 
      ephemeral: true 
    });
    return;
  }

  // Assign middleman
  ticket.middlemanId = interaction.user.id;
  await ticket.save();

  // Update the ticket embed
  const messages = await interaction.channel.messages.fetch({ limit: 10 });
  const ticketMessage = messages.find(m => 
    m.embeds.length > 0 && 
    m.embeds[0].title?.includes('Middleman Trade')
  );

  if (ticketMessage) {
    const updatedEmbed = ticketMessage.embeds[0].toJSON();
    // Update the middleman field
    const fields = updatedEmbed.fields.map(f => {
      if (f.name === '🛡️ Middleman') {
        return { ...f, value: interaction.user.toString() };
      }
      return f;
    });
    updatedEmbed.fields = fields;

    await ticketMessage.edit({ embeds: [updatedEmbed] });
  }

  // Log the claim
  await logTicketAction(interaction.guild, 'middleman_assigned', {
    ticketId: ticket._id,
    ticketNumber: ticket._id.toString().slice(-8).toUpperCase(),
    middleman: interaction.user.tag,
    channel: interaction.channel.name
  });

  await interaction.followUp({ 
    content: `✅ You have claimed this ticket as the middleman.`, 
    ephemeral: true 
  });
}

/**
 * Handle ticket info button clicks
 */
async function handleInfoButton(interaction, ticket, client) {
  if (!ticket) {
    await interaction.followUp({ 
      content: '❌ This is not a valid middleman ticket channel.', 
      ephemeral: true 
    });
    return;
  }

  // Check permissions
  const member = await interaction.guild.members.fetch(interaction.user.id);
  
  try {
    validatePermission(member, ticket, 'view');
  } catch (error) {
    await interaction.followUp({ 
      content: `❌ ${error.message}`, 
      ephemeral: true 
    });
    return;
  }

  // Create and send the info embed
  const infoEmbed = createTicketInfoEmbed(ticket, interaction.guild);

  await interaction.followUp({ 
    embeds: [infoEmbed], 
    ephemeral: true 
  });
}

/**
 * Handle reputation button clicks
 */
async function handleReputationButton(interaction, ticket, customId, client) {
  if (!ticket) {
    await interaction.followUp({ 
      content: '❌ This is not a valid middleman ticket channel.', 
      ephemeral: true 
    });
    return;
  }

  // Check if trade was successful
  if (!ticket.tradeSuccessful) {
    await interaction.followUp({ 
      content: '❌ Reputation can only be given for successful trades.', 
      ephemeral: true 
    });
    return;
  }

  // Check permissions
  const member = await interaction.guild.members.fetch(interaction.user.id);
  
  try {
    validatePermission(member, ticket, 'give_reputation');
  } catch (error) {
    await interaction.followUp({ 
      content: `❌ ${error.message}`, 
      ephemeral: true 
    });
    return;
  }

  // Determine rep type
  const repType = customId === ButtonCustomIds.GIVE_POSITIVE_REP ? 'positive' : 'negative';

  // Show modal for reputation
  const { createReputationModal } = await import('../components/modals/mmModals.js');
  const modal = createReputationModal(repType);
  
  await interaction.showModal(modal);
}

/**
 * Handle modal interactions
 * @param {import('discord.js').ModalSubmitInteraction} interaction
 * @param {import('discord.js').Client} client
 */
async function handleModalInteraction(interaction, client) {
  const customId = interaction.customId;

  try {
    // Check if it's an MM modal
    if (!customId.startsWith('mm_')) {
      return false;
    }

    // Handle create ticket modal
    if (customId === ModalCustomIds.CREATE_TICKET) {
      await handleCreateTicketModal(interaction, client);
      return true;
    }

    // Handle reputation modal
    if (customId.startsWith(ModalCustomIds.GIVE_REPUTATION)) {
      await handleReputationModal(interaction, client);
      return true;
    }

  } catch (error) {
    logger.error('Error handling MM modal interaction:', error);
    
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ 
        content: '❌ An error occurred while processing your submission.', 
        ephemeral: true 
      });
    }
  }

  return false;
}

/**
 * Handle create ticket modal submission
 */
async function handleCreateTicketModal(interaction, client) {
  await interaction.deferReply({ ephemeral: true });

  // Parse modal data
  const { buyer, seller, product, value } = parseCreateTicketModal(interaction);

  // Resolve user IDs
  const resolveUser = async (input) => {
    // Remove mention formatting
    const userId = input.replace(/[<@!>]/g, '');
    try {
      const user = await client.users.fetch(userId);
      return user;
    } catch {
      return null;
    }
  };

  const buyerUser = await resolveUser(buyer);
  const sellerUser = await resolveUser(seller);

  if (!buyerUser || !sellerUser) {
    await interaction.editReply({
      content: '❌ Invalid buyer or seller. Please provide valid user IDs or mentions.'
    });
    return;
  }

  // Create the ticket
  const result = await createTicket({
    client,
    guild: interaction.guild,
    creator: interaction.user,
    buyerId: buyerUser.id,
    sellerId: sellerUser.id,
    product,
    value
  });

  await interaction.editReply({
    content: `✅ Trade ticket created successfully!\nChannel: ${result.channel.toString()}`
  });
}

/**
 * Handle reputation modal submission
 */
async function handleReputationModal(interaction, client) {
  await interaction.deferReply({ ephemeral: false });

  // Parse modal data
  const { repType, comment } = parseReputationModal(interaction);

  // Get the ticket from the channel
  const ticket = await getTicketByChannel(interaction.channel.id);

  if (!ticket || !ticket.tradeSuccessful) {
    await interaction.editReply({
      content: '❌ Reputation can only be given for successful trades in this channel.'
    });
    return;
  }

  // Determine who to give rep to (the other participant)
  const isBuyer = ticket.buyerId === interaction.user.id;
  const targetId = isBuyer ? ticket.sellerId : ticket.buyerId;

  // Get or create reputation
  const targetRep = await Reputation.getOrCreate(targetId, interaction.guild.id);
  
  await targetRep.addReputation(
    interaction.user.id,
    repType,
    ticket._id.toString(),
    comment
  );

  // Get summary
  const summary = targetRep.getSummary();

  // Create embed
  const targetUser = await client.users.fetch(targetId);
  const repEmbed = createReputationEmbed({
    user: targetUser.toString(),
    givenBy: interaction.user.toString(),
    type: repType,
    comment,
    tradeCount: summary.successfulTrades + summary.cancelledTrades,
    successRate: summary.successRate
  });

  await interaction.editReply({
    content: `📊 **Reputation Given**\n${interaction.user.toString()} gave ${repType} reputation to ${targetUser.toString()}`,
    embeds: [repEmbed]
  });

  // Log
  await logTicketAction(interaction.guild, 'reputation_given', {
    ticketId: ticket._id,
    from: interaction.user.tag,
    to: targetUser.tag,
    type: repType,
    comment: comment || 'No comment'
  });
}

export {
  initMmInteractions,
  handleButtonInteraction,
  handleModalInteraction
};

export default {
  init: initMmInteractions,
  handleButton: handleButtonInteraction,
  handleModal: handleModalInteraction
};