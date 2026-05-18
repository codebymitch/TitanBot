/**
 * Embed Builders for Middleman System
 * 
 * Contains all embed builders for the middleman ticket system.
 * Provides consistent styling and formatting across all MM-related messages.
 */

import { EmbedBuilder } from 'discord.js';
import mmConfig from '../config/mmConfig.js';

/**
 * Create a ticket creation embed
 * @param {Object} ticketData - Ticket data
 * @returns {EmbedBuilder}
 */
function createTicketEmbed(ticketData) {
  const { buyer, seller, product, value, ticketNumber, status } = ticketData;
  
  return new EmbedBuilder()
    .setColor(mmConfig.statusColors.waiting_payment)
    .setTitle(`🤝 Middleman Trade #${ticketNumber}`)
    .setDescription('A new trade has been initiated. The middleman will assist both parties.')
    .addFields(
      { name: '🛒 Product', value: product, inline: true },
      { name: '💰 Value', value: value, inline: true },
      { name: '📊 Status', value: mmConfig.statusLabels[status] || status, inline: true },
      { name: '👤 Buyer', value: buyer, inline: true },
      { name: '👤 Seller', value: seller, inline: true },
      { name: '🛡️ Middleman', value: '*Not assigned yet*', inline: true }
    )
    .setFooter({ text: 'Trade ID will be generated once a middleman is assigned' })
    .setTimestamp();
}

/**
 * Create a status update embed
 * @param {string} newStatus - The new status
 * @param {Object} ticketData - Current ticket data
 * @param {string} changedBy - User who changed the status
 * @returns {EmbedBuilder}
 */
function createStatusEmbed(newStatus, ticketData, changedBy) {
  const color = mmConfig.statusColors[newStatus] || 0x2ECC71;
  const label = mmConfig.statusLabels[newStatus] || newStatus;
  
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(`${label}`)
    .setDescription(`Status updated by ${changedBy}`)
    .addFields(
      { name: '🛒 Product', value: ticketData.product, inline: true },
      { name: '💰 Value', value: ticketData.value, inline: true },
      { name: '📊 New Status', value: label, inline: true }
    )
    .setFooter({ text: `Trade #${ticketData.ticketNumber || 'N/A'}` })
    .setTimestamp();
}

/**
 * Create a ticket info embed (for displaying ticket details)
 * @param {Object} ticket - Ticket document from database
 * @param {Object} guild - Discord guild
 * @returns {EmbedBuilder}
 */
function createTicketInfoEmbed(ticket, guild) {
  const buyer = guild.members.cache.get(ticket.buyerId)?.user || { tag: ticket.buyerId, toString: () => `<@${ticket.buyerId}>` };
  const seller = guild.members.cache.get(ticket.sellerId)?.user || { tag: ticket.sellerId, toString: () => `<@${ticket.sellerId}>` };
  const middleman = ticket.middlemanId 
    ? (guild.members.cache.get(ticket.middlemanId)?.user || { tag: ticket.middlemanId, toString: () => `<@${ticket.middlemanId}>` })
    : null;
  
  const duration = ticket.closedAt 
    ? `<t:${Math.floor(ticket.createdAt.getTime() / 1000)}:R> - <t:${Math.floor(ticket.closedAt.getTime() / 1000)}:R> (${Math.round((ticket.closedAt - ticket.createdAt) / 3600000)}h)`
    : `<t:${Math.floor(ticket.createdAt.getTime() / 1000)}:R> - Present`;
  
  return new EmbedBuilder()
    .setColor(ticket.tradeSuccessful ? 0x2ECC71 : ticket.status === 'cancelled' ? 0xE74C3C : 0x3498DB)
    .setTitle(`📋 Trade Ticket Information`)
    .addFields(
      { name: '🆔 Ticket ID', value: ticket._id.toString().slice(-8).toUpperCase(), inline: true },
      { name: '📊 Status', value: mmConfig.statusLabels[ticket.status] || ticket.status, inline: true },
      { name: '⏱️ Duration', value: duration, inline: true },
      { name: '🛒 Product', value: ticket.product, inline: true },
      { name: '💰 Value', value: ticket.value, inline: true },
      { name: '\u200B', value: '\u200B', inline: true },
      { name: '👤 Buyer', value: buyer.toString(), inline: true },
      { name: '👤 Seller', value: seller.toString(), inline: true },
      { name: '🛡️ Middleman', value: middleman ? middleman.toString() : '*Not assigned*', inline: true }
    )
    .setFooter({ text: `Created ${ticket.createdAt.toLocaleDateString()}` })
    .setTimestamp();
}

/**
 * Create a log embed for logging actions
 * @param {string} action - The action that was performed
 * @param {Object} details - Details about the action
 * @returns {EmbedBuilder}
 */
function createLogEmbed(action, details) {
  const actionColors = {
    ticket_created: 0x3498DB,
    status_changed: 0xF39C12,
    ticket_closed: 0xE74C3C,
    reputation_given: 0x2ECC71,
    middleman_assigned: 0x9B59B6
  };
  
  return new EmbedBuilder()
    .setColor(actionColors[action] || 0x95A5A6)
    .setTitle(`📝 ${action.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}`)
    .addFields(
      Object.entries(details).map(([key, value]) => ({
        name: key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' '),
        value: String(value),
        inline: key !== 'description'
      }))
    )
    .setFooter({ text: `Action ID: ${Date.now().toString(36)}` })
    .setTimestamp();
}

/**
 * Create a reputation embed
 * @param {Object} reputationData - Reputation data
 * @returns {EmbedBuilder}
 */
function createReputationEmbed(reputationData) {
  const { user, givenBy, type, comment, tradeCount, successRate } = reputationData;
  
  const typeEmojis = {
    positive: '✅',
    negative: '❌',
    neutral: '⚪'
  };
  
  const typeColors = {
    positive: 0x2ECC71,
    negative: 0xE74C3C,
    neutral: 0x95A5A6
  };
  
  return new EmbedBuilder()
    .setColor(typeColors[type] || 0x95A5A6)
    .setTitle(`${typeEmojis[type] || '📊'} Reputation Update`)
    .setDescription(`Reputation ${type} given to ${user}`)
    .addFields(
      { name: '📈 Total Trades', value: `${tradeCount}`, inline: true },
      { name: '✅ Success Rate', value: `${successRate}%`, inline: true },
      { name: '👤 Given By', value: givenBy, inline: true }
    )
    .setFooter({ text: comment ? `Comment: ${comment.slice(0, 100)}` : 'No comment provided' })
    .setTimestamp();
}

/**
 * Create a transcript header embed
 * @param {Object} ticket - Ticket data
 * @param {string} closedBy - User who closed the ticket
 * @returns {EmbedBuilder}
 */
function createTranscriptEmbed(ticket, closedBy) {
  const duration = ticket.closedAt 
    ? Math.round((ticket.closedAt - ticket.createdAt) / 1000)
    : Math.round((Date.now() - ticket.createdAt) / 1000);
  
  const hours = Math.floor(duration / 3600);
  const minutes = Math.floor((duration % 3600) / 60);
  const seconds = duration % 60;
  
  return new EmbedBuilder()
    .setColor(ticket.tradeSuccessful ? 0x2ECC71 : 0xE74C3C)
    .setTitle('📜 Trade Transcript')
    .setDescription(`This is the official transcript of the trade ticket.`)
    .addFields(
      { name: '🆔 Ticket ID', value: ticket._id.toString().slice(-8).toUpperCase(), inline: true },
      { name: '📊 Final Status', value: ticket.tradeSuccessful ? '✅ Completed' : '❌ Cancelled', inline: true },
      { name: '⏱️ Duration', value: `${hours}h ${minutes}m ${seconds}s`, inline: true },
      { name: '🛒 Product', value: ticket.product, inline: true },
      { name: '💰 Value', value: ticket.value, inline: true },
      { name: '🚪 Closed By', value: closedBy, inline: true },
      { name: '👤 Buyer', value: `<@${ticket.buyerId}>`, inline: true },
      { name: '👤 Seller', value: `<@${ticket.sellerId}>`, inline: true },
      { name: '🛡️ Middleman', value: ticket.middlemanId ? `<@${ticket.middlemanId}>` : '*Not assigned*', inline: true }
    )
    .setFooter({ text: `Transcript generated on ${new Date().toLocaleString()}` })
    .setTimestamp();
}

/**
 * Create a welcome/info embed for new ticket
 * @param {Object} ticketData - Ticket data
 * @param {boolean} hasPaymentInfo - Whether to show payment info
 * @returns {EmbedBuilder}
 */
function createWelcomeEmbed(ticketData, hasPaymentInfo = false) {
  const fields = [
    {
      name: '📋 How This Works',
      value: '1. The **middleman** will verify both parties\n' +
             '2. The **buyer** sends payment to the middleman\n' +
             '3. The **seller** delivers the product/service\n' +
             '4. The **middleman** releases payment to seller\n' +
             '5. Both parties can leave **reputation**',
      inline: false
    }
  ];
  
  if (hasPaymentInfo && (mmConfig.pixKey || mmConfig.paypalEmail)) {
    let paymentInfo = '';
    if (mmConfig.pixKey) {
      paymentInfo += `**PIX Key:** \`${mmConfig.pixKey}\`\n`;
    }
    if (mmConfig.paypalEmail) {
      paymentInfo += `**PayPal:** \`${mmConfig.paypalEmail}\`\n`;
    }
    
    fields.push({
      name: '💳 Payment Methods',
      value: paymentInfo,
      inline: false
    });
  }
  
  fields.push({
    name: '⚠️ Important Notes',
    value: '• Never share personal information\n' +
           '• Wait for middleman confirmation before sending anything\n' +
           '• Use the buttons below to update trade status\n' +
           '• Only middleman/staff can close this ticket',
    inline: false
  });
  
  return new EmbedBuilder()
    .setColor(0x3498DB)
    .setTitle('🛡️ Welcome to Middleman Service')
    .setDescription(`Trade between ${ticketData.buyer} and ${ticketData.seller}`)
    .addFields(fields)
    .setFooter({ text: 'Ticket ID: ' + (ticketData.ticketNumber || 'Pending') })
    .setTimestamp();
}

export {
  createTicketEmbed,
  createStatusEmbed,
  createTicketInfoEmbed,
  createLogEmbed,
  createReputationEmbed,
  createTranscriptEmbed,
  createWelcomeEmbed
};

export default {
  ticket: createTicketEmbed,
  status: createStatusEmbed,
  info: createTicketInfoEmbed,
  log: createLogEmbed,
  reputation: createReputationEmbed,
  transcript: createTranscriptEmbed,
  welcome: createWelcomeEmbed
};