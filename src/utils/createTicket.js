/**
 * Ticket Creation Utility
 * 
 * Handles the creation of middleman ticket channels with proper permissions.
 */

import { ChannelType, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import Ticket from '../models/Ticket.js';
import mmConfig from '../config/mmConfig.js';
import { createTicketEmbed, createWelcomeEmbed } from './mmEmbeds.js';
import { createStatusButtons, createWelcomeButtons } from '../components/buttons/mmButtons.js';
import { connectMongoDB } from '../database/mongoose.js';
import { logger } from './logger.js';

/**
 * Generate a unique ticket number
 * @param {string} guildId - The guild ID
 * @returns {Promise<string>} The ticket number
 */
async function generateTicketNumber(guildId) {
  const count = await Ticket.countDocuments({ guildId });
  return `${guildId.slice(-4)}-${String(count + 1).padStart(4, '0')}`;
}

/**
 * Resolve a user mention or ID to a user object
 * @param {import('discord.js').Client} client - Discord client
 * @param {string} input - User mention or ID
 * @returns {Promise<import('discord.js').User|null>}
 */
async function resolveUser(client, input) {
  // Remove mention formatting
  const userId = input.replace(/[<@!>]/g, '');
  
  try {
    const user = await client.users.fetch(userId);
    return user;
  } catch {
    return null;
  }
}

/**
 * Create a new middleman ticket
 * @param {Object} options - Ticket creation options
 * @param {import('discord.js').Client} options.client - Discord client
 * @param {import('discord.js').Guild} options.guild - Guild where to create the ticket
 * @param {import('discord.js').User} options.creator - User who created the ticket
 * @param {string} options.buyerId - Buyer user ID
 * @param {string} options.sellerId - Seller user ID
 * @param {string} options.product - Product/service being traded
 * @param {string} options.value - Trade value
 * @returns {Promise<Object>} Created ticket and channel info
 */
async function createTicket({
  client,
  guild,
  creator,
  buyerId,
  sellerId,
  product,
  value
}) {
  try {
    // Ensure MongoDB is connected
    await connectMongoDB();

    // Generate ticket number
    const ticketNumber = await generateTicketNumber(guild.id);

    // Get user objects
    const buyer = await resolveUser(client, buyerId);
    const seller = await resolveUser(client, sellerId);

    if (!buyer || !seller) {
      throw new Error('Invalid buyer or seller user ID');
    }

    // Create channel name
    const channelName = `${mmConfig.ticketNamePrefix}-${ticketNumber.toLowerCase()}`;

    // Get or create the MM category
    let category;
    if (mmConfig.mmCategoryId) {
      category = guild.channels.cache.get(mmConfig.mmCategoryId);
    }
    
    if (!category || category.type !== ChannelType.GuildCategory) {
      category = await guild.channels.create({
        name: '🛡️ Middleman Tickets',
        type: ChannelType.GuildCategory,
        permissionOverwrites: [
          {
            id: guild.id,
            deny: [PermissionFlagsBits.ViewChannel]
          }
        ]
      });
    }

    // Create the ticket channel
    const channel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: category.id,
      topic: mmConfig.ticketTopicTemplate(buyer.tag, seller.tag, product),
      permissionOverwrites: [
        {
          id: guild.id,
          deny: [PermissionFlagsBits.ViewChannel]
        },
        {
          id: buyer.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.AddReactions,
            PermissionFlagsBits.AttachFiles
          ]
        },
        {
          id: seller.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.AddReactions,
            PermissionFlagsBits.AttachFiles
          ]
        },
        {
          id: mmConfig.mmRoleId,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.ManageMessages,
            PermissionFlagsBits.AddReactions,
            PermissionFlagsBits.AttachFiles
          ]
        },
        {
          id: mmConfig.staffRoleId,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.ManageMessages,
            PermissionFlagsBits.AddReactions,
            PermissionFlagsBits.AttachFiles,
            PermissionFlagsBits.ManageChannels
          ]
        }
      ]
    });

    // Create ticket in database
    const ticket = await Ticket.createTicket({
      channelId: channel.id,
      guildId: guild.id,
      buyerId: buyer.id,
      sellerId: seller.id,
      product,
      value,
      status: 'waiting_payment',
      creatorId: creator.id
    });

    // Send welcome message with embed and buttons
    const ticketData = {
      buyer: buyer.toString(),
      seller: seller.toString(),
      product,
      value,
      ticketNumber,
      status: 'waiting_payment'
    };

    // Main ticket embed
    const ticketEmbed = createTicketEmbed(ticketData);
    
    // Welcome/info embed
    const welcomeEmbed = createWelcomeEmbed(ticketData, true);

    // Send the messages
    await channel.send({
      content: `🛡️ **Middleman Ticket Created**\n` +
               `${creator.toString()} created this trade ticket.\n` +
               `Buyer: ${buyer.toString()} | Seller: ${seller.toString()}`,
      embeds: [ticketEmbed]
    });

    await channel.send({
      embeds: [welcomeEmbed],
      components: createWelcomeButtons()
    });

    // Send status control message (for MM/staff)
    const statusEmbed = new EmbedBuilder()
      .setColor(mmConfig.statusColors.waiting_payment)
      .setTitle('📊 Trade Status Control')
      .setDescription('Use the buttons below to update the trade status.')
      .setFooter({ text: `Ticket: ${ticketNumber}` })
      .setTimestamp();

    await channel.send({
      embeds: [statusEmbed],
      components: createStatusButtons()
    });

    // Log the ticket creation
    await logTicketAction(guild, 'ticket_created', {
      ticketId: ticket._id,
      ticketNumber,
      channel: channel.toString(),
      creator: creator.tag,
      buyer: buyer.tag,
      seller: seller.tag,
      product,
      value
    });

    logger.info(`Middleman ticket created: ${ticketNumber} in ${channel.name}`);

    return {
      ticket,
      channel,
      ticketNumber
    };

  } catch (error) {
    logger.error('Error creating middleman ticket:', error);
    throw error;
  }
}

/**
 * Log a ticket action to the log channel
 * @param {import('discord.js').Guild} guild - The guild
 * @param {string} action - The action type
 * @param {Object} details - Action details
 */
async function logTicketAction(guild, action, details) {
  if (!mmConfig.logChannelId) return;

  const logChannel = guild.channels.cache.get(mmConfig.logChannelId);
  if (!logChannel) return;

  try {
    const { createLogEmbed } = await import('./mmEmbeds.js');
    const logEmbed = createLogEmbed(action, details);
    await logChannel.send({ embeds: [logEmbed] });
  } catch (error) {
    logger.error('Error logging ticket action:', error);
  }
}

/**
 * Get a ticket by channel ID
 * @param {string} channelId - The channel ID
 * @returns {Promise<Ticket|null>}
 */
async function getTicketByChannel(channelId) {
  await connectMongoDB();
  return await Ticket.findOne({ channelId });
}

/**
 * Get a ticket by ID
 * @param {string} ticketId - The ticket ID
 * @returns {Promise<Ticket|null>}
 */
async function getTicketById(ticketId) {
  await connectMongoDB();
  return await Ticket.findById(ticketId);
}

/**
 * Get all open tickets for a guild
 * @param {string} guildId - The guild ID
 * @returns {Promise<Ticket[]>}
 */
async function getOpenTickets(guildId) {
  await connectMongoDB();
  return await Ticket.find({ guildId, closedAt: null }).sort({ createdAt: -1 });
}

/**
 * Get all tickets for a user
 * @param {string} userId - The user ID
 * @param {string} guildId - The guild ID
 * @returns {Promise<Ticket[]>}
 */
async function getUserTickets(userId, guildId) {
  await connectMongoDB();
  return await Ticket.find({
    guildId,
    $or: [
      { buyerId: userId },
      { sellerId: userId },
      { middlemanId: userId }
    ]
  }).sort({ createdAt: -1 });
}

export {
  createTicket,
  getTicketByChannel,
  getTicketById,
  getOpenTickets,
  getUserTickets,
  generateTicketNumber,
  logTicketAction,
  resolveUser
};

export default {
  create: createTicket,
  getByChannel: getTicketByChannel,
  getById: getTicketById,
  getOpen: getOpenTickets,
  getUserTickets,
  generateNumber: generateTicketNumber,
  log: logTicketAction,
  resolveUser
};