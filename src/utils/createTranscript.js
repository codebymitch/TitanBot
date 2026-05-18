/**
 * Transcript Creation Utility
 * 
 * Generates HTML transcripts of ticket conversations and saves them.
 */

import { EmbedBuilder, AttachmentBuilder } from 'discord.js';
import { createTranscript as createHtmlTranscript } from 'discord-html-transcripts';
import Ticket from '../models/Ticket.js';
import mmConfig from '../config/mmConfig.js';
import { createTranscriptEmbed } from './mmEmbeds.js';
import { connectMongoDB } from '../database/mongoose.js';
import { logger } from './logger.js';

/**
 * Generate an HTML transcript of a ticket channel
 * @param {import('discord.js').TextChannel} channel - The ticket channel
 * @param {Ticket} ticket - The ticket document
 * @param {string} closedBy - User who closed the ticket
 * @returns {Promise<Object>} Transcript info including attachment
 */
async function createTranscript(channel, ticket, closedBy) {
  try {
    await connectMongoDB();

    // Fetch recent messages (limit to 100 to avoid performance issues)
    const messages = await channel.messages.fetch({ limit: 100 });
    
    // Reverse to get chronological order
    const sortedMessages = messages.reverse();

    // Create the HTML transcript
    const transcriptAttachment = await createHtmlTranscript.createTranscript(sortedMessages, {
      limit: 100,
      returnType: 'attachment',
      filename: `transcript-${ticket._id.toString().slice(-8)}.html`,
      saveImages: false,
      poweredBy: false,
      guildName: channel.guild.name,
      includeChannelTopics: true
    });

    return {
      attachment: transcriptAttachment,
      filename: `transcript-${ticket._id.toString().slice(-8)}.html`
    };

  } catch (error) {
    logger.error('Error creating transcript:', error);
    
    // Return a basic text transcript as fallback
    return await createTextTranscript(channel, ticket, closedBy);
  }
}

/**
 * Create a text-based transcript as fallback
 * @param {import('discord.js').TextChannel} channel - The ticket channel
 * @param {Ticket} ticket - The ticket document
 * @param {string} closedBy - User who closed the ticket
 * @returns {Promise<Object>} Text transcript attachment
 */
async function createTextTranscript(channel, ticket, closedBy) {
  try {
    const messages = await channel.messages.fetch({ limit: 100 });
    const sortedMessages = messages.reverse();

    let transcriptContent = `
═══════════════════════════════════════════════════════════════
  MIDDLEMAN TRADE TRANSCRIPT
═══════════════════════════════════════════════════════════════

  Ticket ID: ${ticket._id.toString().slice(-8).toUpperCase()}
  Channel: #${channel.name}
  Guild: ${channel.guild.name}
  
  ─────────────────────────────────────────────────────────────
  
  👤 Buyer: <@${ticket.buyerId}> (${ticket.buyerId})
  👤 Seller: <@${ticket.sellerId}> (${ticket.sellerId})
  🛡️ Middleman: ${ticket.middlemanId ? `<@${ticket.middlemanId}> (${ticket.middlemanId})` : 'Not assigned'}
  
  🛒 Product: ${ticket.product}
  💰 Value: ${ticket.value}
  
  📊 Status: ${ticket.tradeSuccessful ? '✅ Completed' : '❌ Cancelled'}
  🚪 Closed By: ${closedBy}
  
  ⏱️ Duration: ${ticket.closedAt ? Math.round((ticket.closedAt - ticket.createdAt) / 1000) : 'N/A'} seconds
  
  ─────────────────────────────────────────────────────────────
  
  MESSAGE HISTORY:
  
`;

    for (const message of sortedMessages) {
      if (message.system) continue;
      
      const timestamp = message.createdAt.toISOString();
      const author = message.author ? message.author.tag : 'Unknown';
      const content = message.content || (message.embeds.length > 0 ? '[Embed]' : '[No content]');
      
      transcriptContent += `[${timestamp}] ${author}: ${content}\n`;
      
      // Include attachments if any
      if (message.attachments.size > 0) {
        for (const attachment of message.attachments.values()) {
          transcriptContent += `  📎 Attachment: ${attachment.name} (${attachment.url})\n`;
        }
      }
    }

    transcriptContent += `
═══════════════════════════════════════════════════════════════
  END OF TRANSCRIPT
  Generated: ${new Date().toISOString()}
═══════════════════════════════════════════════════════════════
`;

    const buffer = Buffer.from(transcriptContent);
    const attachment = new AttachmentBuilder(buffer, { 
      name: `transcript-${ticket._id.toString().slice(-8)}.txt` 
    });

    return {
      attachment,
      filename: `transcript-${ticket._id.toString().slice(-8)}.txt`
    };

  } catch (error) {
    logger.error('Error creating text transcript:', error);
    throw error;
  }
}

/**
 * Send the transcript to the transcript channel and ticket
 * @param {import('discord.js').TextChannel} channel - The ticket channel
 * @param {Ticket} ticket - The ticket document
 * @param {Object} transcriptData - The transcript data from createTranscript
 * @param {string} closedBy - User who closed the ticket
 * @returns {Promise<string>} The transcript message ID
 */
async function sendTranscript(channel, ticket, transcriptData, closedBy) {
  try {
    // Get or create transcript channel
    let transcriptChannel = channel.guild.channels.cache.get(mmConfig.transcriptChannelId);
    
    if (!transcriptChannel) {
      // Try to find an existing transcript channel
      transcriptChannel = channel.guild.channels.cache.find(
        ch => ch.name.includes('transcript') || ch.name.includes('logs')
      );
      
      if (!transcriptChannel) {
        // Create a new transcript channel
        transcriptChannel = await channel.guild.channels.create({
          name: 'mm-transcripts',
          type: channel.type,
          permissionOverwrites: [
            {
              id: channel.guild.id,
              deny: [require('discord.js').PermissionFlagsBits.ViewChannel]
            },
            {
              id: mmConfig.staffRoleId,
              allow: [
                require('discord.js').PermissionFlagsBits.ViewChannel,
                require('discord.js').PermissionFlagsBits.ReadMessageHistory,
                require('discord.js').PermissionFlagsBits.AttachFiles
              ]
            }
          ]
        });
      }
    }

    // Create transcript embed
    const transcriptEmbed = createTranscriptEmbed(ticket, closedBy);

    // Send to transcript channel
    const transcriptMessage = await transcriptChannel.send({
      content: `📜 **Trade Transcript** | Ticket: ${ticket._id.toString().slice(-8).toUpperCase()}`,
      embeds: [transcriptEmbed],
      files: [transcriptData.attachment]
    });

    // Update ticket with transcript message ID
    ticket.transcriptMessageId = transcriptMessage.id;
    await ticket.save();

    // Also send to the ticket channel before closing
    await channel.send({
      content: '📜 The transcript of this conversation has been saved.',
      embeds: [transcriptEmbed]
    });

    return transcriptMessage.id;

  } catch (error) {
    logger.error('Error sending transcript:', error);
    throw error;
  }
}

/**
 * Close a ticket and generate its transcript
 * @param {Object} options - Close options
 * @param {import('discord.js').TextChannel} options.channel - The ticket channel
 * @param {Ticket} options.ticket - The ticket document
 * @param {import('discord.js').User} options.closedBy - User closing the ticket
 * @param {boolean} options.tradeSuccessful - Whether the trade was successful
 * @param {boolean} options.deleteChannel - Whether to delete the channel after
 * @returns {Promise<Object>} Result of the close operation
 */
async function closeTicket({
  channel,
  ticket,
  closedBy,
  tradeSuccessful = false,
  deleteChannel = true
}) {
  try {
    // Update ticket status
    await ticket.closeTicket(closedBy.id, tradeSuccessful);

    // Update reputation
    const Reputation = (await import('../models/Reputation.js')).default;
    
    if (tradeSuccessful) {
      // Add successful trade to both buyer and seller
      const buyerRep = await Reputation.getOrCreate(ticket.buyerId, ticket.guildId);
      const sellerRep = await Reputation.getOrCreate(ticket.sellerId, ticket.guildId);
      
      await buyerRep.addSuccessfulTrade();
      await sellerRep.addSuccessfulTrade();
    } else {
      // Add cancelled trade
      const buyerRep = await Reputation.getOrCreate(ticket.buyerId, ticket.guildId);
      const sellerRep = await Reputation.getOrCreate(ticket.sellerId, ticket.guildId);
      
      await buyerRep.addCancelledTrade();
      await sellerRep.addCancelledTrade();
    }

    // Generate and send transcript
    const transcriptData = await createTranscript(channel, ticket, closedBy.tag);
    const transcriptMessageId = await sendTranscript(channel, ticket, transcriptData, closedBy.tag);

    // Log the closure
    const { logTicketAction } = await import('./createTicket.js');
    await logTicketAction(channel.guild, 'ticket_closed', {
      ticketId: ticket._id,
      ticketNumber: ticket._id.toString().slice(-8).toUpperCase(),
      channel: channel.name,
      closedBy: closedBy.tag,
      tradeSuccessful: tradeSuccessful ? 'Yes' : 'No',
      buyer: `<@${ticket.buyerId}>`,
      seller: `<@${ticket.sellerId}>`,
      middleman: ticket.middlemanId ? `<@${ticket.middlemanId}>` : 'Not assigned'
    });

    // Send final message
    await channel.send({
      content: `🔒 **Ticket Closed**\n` +
               `This ticket has been closed by ${closedBy.toString()}.\n` +
               `Trade Status: ${tradeSuccessful ? '✅ Successful' : '❌ Cancelled'}\n` +
               `A transcript has been generated and saved.`,
      embeds: [transcriptData.attachment ? createTranscriptEmbed(ticket, closedBy.tag) : null].filter(Boolean)
    });

    // Delete the channel if requested
    if (deleteChannel && channel.deletable) {
      // Wait a bit for users to see the final message
      await new Promise(resolve => setTimeout(resolve, 3000));
      await channel.delete();
    }

    logger.info(`Ticket closed: ${ticket._id} by ${closedBy.tag}`);

    return {
      success: true,
      ticket,
      transcriptMessageId,
      channelDeleted: deleteChannel
    };

  } catch (error) {
    logger.error('Error closing ticket:', error);
    throw error;
  }
}

export {
  createTranscript,
  sendTranscript,
  closeTicket,
  createTextTranscript
};

export default {
  create: createTranscript,
  send: sendTranscript,
  close: closeTicket,
  createText: createTextTranscript
};