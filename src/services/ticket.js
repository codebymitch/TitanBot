import { 
  ChannelType, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  EmbedBuilder,
  PermissionFlagsBits
} from 'discord.js';
import { getGuildConfig } from './guildConfig.js';
import { getTicketData, saveTicketData, deleteTicketData, getFromDb, setInDb } from './database.js';
import { logger } from '../utils/logger.js';
import { createEmbed, errorEmbed } from '../utils/embeds.js';
import { logTicketEvent } from '../utils/ticketLogging.js';

// Priority mapping
const PRIORITY_MAP = {
  none: { name: '⚪ NONE', color: '#95a5a6', emoji: '⚪', label: 'None' },
  low: { name: '🔵 LOW', color: '#3498db', emoji: '🔵', label: 'Low' },
  medium: { name: '🟢 MEDIUM', color: '#2ecc71', emoji: '🟢', label: 'Medium' },
  high: { name: '🟡 HIGH', color: '#f1c40f', emoji: '🟡', label: 'High' },
  urgent: { name: '🔴 URGENT', color: '#e74c3c', emoji: '🔴', label: 'Urgent' }
};

/**
 * Count the number of open tickets for a user in a guild
 */
export async function getUserTicketCount(guildId, userId) {
  try {
    // Get all ticket keys for this guild
    const ticketKeys = await getFromDb(`guild:${guildId}:ticket:*`, {});
    const allKeys = Object.keys(ticketKeys);
    
    let userTicketCount = 0;
    
    for (const key of allKeys) {
      try {
        const ticketData = await getFromDb(key, null);
        if (ticketData && ticketData.userId === userId && ticketData.status === 'open') {
          userTicketCount++;
        }
      } catch (error) {
        // Skip invalid tickets
        continue;
      }
    }
    
    return userTicketCount;
  } catch (error) {
    logger.error('Error counting user tickets:', error);
    return 0;
  }
}

export async function createTicket(guild, member, categoryId, reason = 'No reason provided', priority = 'none') {
  try {
    const config = await getGuildConfig({}, guild.id);
    const ticketConfig = config.tickets || {};
    
    // Check ticket limit
    const maxTicketsPerUser = config.maxTicketsPerUser || 3;
    const currentTicketCount = await getUserTicketCount(guild.id, member.id);
    
    if (currentTicketCount >= maxTicketsPerUser) {
      return {
        success: false,
        error: `You have reached the maximum number of open tickets (${maxTicketsPerUser}). Please close your existing tickets before creating a new one.`
      };
    }
    
    // Get or create ticket category
    let category = categoryId ? 
      guild.channels.cache.get(categoryId) :
      guild.channels.cache.find(c => 
        c.type === ChannelType.GuildCategory && 
        c.name.toLowerCase().includes('tickets')
      );
    
    if (!category && !categoryId) {
      category = await guild.channels.create({
        name: 'Tickets',
        type: ChannelType.GuildCategory,
        permissionOverwrites: [
          {
            id: guild.id,
            deny: [PermissionFlagsBits.ViewChannel],
          },
        ],
      });
    }
    
    // Create ticket channel
    const ticketNumber = await getNextTicketNumber(guild.id);
    
    // Force the channel name to use our format, ignoring any config that might be corrupted
    let channelName = `ticket-${ticketNumber}`;
    
    // Add priority emoji to channel name if priority is not 'none'
    if (priority !== 'none') {
      const priorityInfo = PRIORITY_MAP[priority];
      if (priorityInfo) {
        channelName = `${priorityInfo.emoji} ${channelName}`;
      }
    }
    
    const channel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: category?.id,
      permissionOverwrites: [
        {
          id: guild.id,
          deny: [PermissionFlagsBits.ViewChannel],
        },
        {
          id: member.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.AttachFiles,
            PermissionFlagsBits.ReadMessageHistory,
          ],
        },
        ...(ticketConfig.supportRoles?.map(roleId => ({
          id: roleId,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.AttachFiles,
            PermissionFlagsBits.ReadMessageHistory,
          ],
        })) || []),
      ],
    });
    
    // Save ticket data
    const ticketData = {
      id: channel.id,
      userId: member.id,
      guildId: guild.id,
      createdAt: new Date().toISOString(),
      status: 'open',
      claimedBy: null,
      priority: priority || 'none',
      reason,
    };
    
    await saveTicketData(guild.id, channel.id, ticketData);
    
    // Send ticket message
    const priorityInfo = PRIORITY_MAP[priority] || PRIORITY_MAP.none;
    
    const embed = createEmbed({
      title: `Ticket #${ticketNumber}`,
      description: `${member.toString()}, thanks for creating a ticket!\n\n**Reason:** ${reason}\n**Priority:** ${priorityInfo.emoji} ${priorityInfo.label}`,
      color: priorityInfo.color,
      fields: [
        { name: 'Status', value: '🟢 Open', inline: true },
        { name: 'Claimed By', value: 'Not claimed', inline: true },
        { name: 'Created', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true },
      ],
    });
    
    // Create action buttons
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('ticket_close')
        .setLabel('Close Ticket')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('🔒'),
      new ButtonBuilder()
        .setCustomId('ticket_claim')
        .setLabel('Claim')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('🙋'),
      new ButtonBuilder()
        .setCustomId('ticket_transcript')
        .setLabel('Transcript')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('📜')
    );
    
    // Add priority buttons if enabled
    if (ticketConfig.enablePriority) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId('ticket_priority:low')
          .setLabel('Low')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('🔵'),
        new ButtonBuilder()
          .setCustomId('ticket_priority:high')
          .setLabel('High')
          .setStyle(ButtonStyle.Danger)
          .setEmoji('🔴')
      );
    }
    
    const messageContent = `${member.toString()}${ticketConfig.supportRoles?.length ? ' ' + ticketConfig.supportRoles.map(r => `<@&${r}>`).join(' ') : ''}`;
    
    await channel.send({ 
      content: messageContent,
      embeds: [embed],
      components: [row] 
    });
    
    // Log ticket creation
    await logTicketEvent({
      client: guild.client,
      guildId: guild.id,
      event: {
        type: 'open',
        ticketId: channel.id,
        ticketNumber: ticketNumber,
        userId: member.id,
        executorId: member.id,
        reason: reason,
        priority: priority || 'none',
        metadata: {
          channelId: channel.id,
          categoryName: category?.name || 'Default'
        }
      }
    });
    
    return { success: true, channel, ticketData };
    
  } catch (error) {
    logger.error('Error creating ticket:', error);
    return { 
      success: false, 
      error: error.message || 'Failed to create ticket' 
    };
  }
}

export async function closeTicket(channel, closer, reason = 'No reason provided') {
  try {
    const ticketData = await getTicketData(channel.guild.id, channel.id);
    if (!ticketData) {
      return { success: false, error: 'This is not a ticket channel' };
    }
    
    // Get guild config to check DM setting
    const config = await getGuildConfig(channel.client, channel.guild.id);
    const dmOnClose = config.dmOnClose !== false; // Default to true
    
    // Update ticket data
    ticketData.status = 'closed';
    ticketData.closedBy = closer.id;
    ticketData.closedAt = new Date().toISOString();
    ticketData.closeReason = reason;
    
    await saveTicketData(channel.guild.id, channel.id, ticketData);
    
    // Send DM to ticket creator if enabled
    if (dmOnClose) {
      try {
        const ticketCreator = await channel.client.users.fetch(ticketData.userId).catch(() => null);
        if (ticketCreator) {
          const dmEmbed = createEmbed({
            title: '🎫 Your Ticket Has Been Closed',
            description: `Your ticket **${channel.name}** has been closed.\n\n**Reason:** ${reason}\n**Closed by:** ${closer.tag}\n**Closed at:** <t:${Math.floor(Date.now() / 1000)}:F>\n\nThank you for using our support system! If you have any further questions, feel free to create a new ticket.`,
            color: '#e74c3c',
            footer: { text: `Ticket ID: ${ticketData.id}` }
          });
          
          await ticketCreator.send({ embeds: [dmEmbed] });
        }
      } catch (dmError) {
        console.warn(`Could not send DM to ticket creator ${ticketData.userId}:`, dmError.message);
        // Continue with ticket closure even if DM fails
      }
    }
    
    // Update channel permissions
    try {
      const user = await channel.guild.members.fetch(ticketData.userId).catch(() => null);
      const targetUser = user?.user || await channel.client.users.fetch(ticketData.userId).catch(() => null);
      
      if (targetUser) {
        const overwrite = channel.permissionOverwrites.cache.get(ticketData.userId);
        if (overwrite) {
          await overwrite.edit({
            ViewChannel: false,
            SendMessages: false,
          });
        } else {
          await channel.permissionOverwrites.create(targetUser, {
            ViewChannel: false,
            SendMessages: false,
          });
        }
      }
    } catch (permError) {
      console.warn('Could not update user permissions for closed ticket:', permError.message);
    }
    
    // Update ticket message
    const messages = await channel.messages.fetch();
    const ticketMessage = messages.find(m => 
      m.embeds.length > 0 && 
      m.embeds[0].title?.startsWith('Ticket #')
    );
    
    if (ticketMessage) {
      const embed = ticketMessage.embeds[0];
      const statusField = embed.fields?.find(f => f.name === 'Status');
      
      if (statusField) {
        statusField.value = '🔴 Closed';
      }
      
      // Create a new embed to avoid validation issues with the existing one
      const updatedEmbed = createEmbed({
        title: embed.title || 'Ticket',
        description: embed.description || 'Ticket discussion',
        color: '#e74c3c',
        fields: embed.fields || [],
        footer: embed.footer
      });
      
      await ticketMessage.edit({ 
        embeds: [updatedEmbed],
        components: [] // Remove all buttons
      });
    }
    
    // Remove the ticket creator's access
    try {
      const user = await channel.guild.members.fetch(ticketData.userId).catch(() => null);
      if (user) {
        await channel.permissionOverwrites.delete(user, 'Ticket closed');
      }
    } catch (error) {
      logger.warn(`Could not remove user ${ticketData.userId} from ticket channel:`, error.message);
    }
    
    // Send close message with control buttons
    const closeEmbed = createEmbed({
      title: 'Ticket Closed',
      description: `This ticket has been closed by ${closer}.\n**Reason:** ${reason}${dmOnClose ? '\n\n📩 A DM has been sent to the ticket creator.' : ''}`,
      color: '#e74c3c',
      footer: { text: `Ticket ID: ${ticketData.id}` }
    });
    
    const controlRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('ticket_reopen')
        .setLabel('Reopen Ticket')
        .setStyle(ButtonStyle.Success)
        .setEmoji('🔓'),
      new ButtonBuilder()
        .setCustomId('ticket_delete')
        .setLabel('Delete Ticket')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('🗑️')
    );
    
    await channel.send({ embeds: [closeEmbed], components: [controlRow] });
    
    // Log ticket closure
    await logTicketEvent({
      client: channel.client,
      guildId: channel.guild.id,
      event: {
        type: 'close',
        ticketId: channel.id,
        ticketNumber: ticketData.id,
        userId: ticketData.userId,
        executorId: closer.id,
        reason: reason,
        metadata: {
          dmSent: dmOnClose,
          closedAt: ticketData.closedAt
        }
      }
    });
    
    return { success: true, ticketData };
    
  } catch (error) {
    logger.error('Error closing ticket:', error);
    return { 
      success: false, 
      error: error.message || 'Failed to close ticket' 
    };
  }
}

export async function claimTicket(channel, claimer) {
  try {
    const ticketData = await getTicketData(channel.guild.id, channel.id);
    if (!ticketData) {
      return { success: false, error: 'This is not a ticket channel' };
    }
    
    if (ticketData.claimedBy) {
      return { 
        success: false, 
        error: `This ticket is already claimed by <@${ticketData.claimedBy}>` 
      };
    }
    
    // Update ticket data
    ticketData.claimedBy = claimer.id;
    ticketData.claimedAt = new Date().toISOString();
    
    await saveTicketData(channel.guild.id, channel.id, ticketData);
    
    // Update ticket message
    const messages = await channel.messages.fetch();
    const ticketMessage = messages.find(m => 
      m.embeds.length > 0 && 
      m.embeds[0].title?.startsWith('Ticket #')
    );
    
    if (ticketMessage) {
      const embed = ticketMessage.embeds[0];
      const claimedField = embed.fields?.find(f => f.name === 'Claimed By');
      
      if (claimedField) {
        claimedField.value = claimer.toString();
      }
      
      // Rebuild the action row with updated claim button
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('ticket_close')
          .setLabel('Close Ticket')
          .setStyle(ButtonStyle.Danger)
          .setEmoji('🔒'),
        new ButtonBuilder()
          .setCustomId('ticket_claim')
          .setLabel('Claimed')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('🙋')
          .setDisabled(true),
        new ButtonBuilder()
          .setCustomId('ticket_transcript')
          .setLabel('Transcript')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('📜')
      );
      
      await ticketMessage.edit({ 
        embeds: [embed],
        components: [row] 
      });
    }
    
    // Send claim message with unclaim button
    const claimEmbed = createEmbed({
      title: 'Ticket Claimed',
      description: `🎉 ${claimer} has claimed this ticket!`,
      color: '#2ecc71'
    });
    
    const unclaimRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('ticket_unclaim')
        .setLabel('Unclaim')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('🔓')
    );
    
    await channel.send({ embeds: [claimEmbed], components: [unclaimRow] });
    
    // Log ticket claim
    await logTicketEvent({
      client: channel.client,
      guildId: channel.guild.id,
      event: {
        type: 'claim',
        ticketId: channel.id,
        ticketNumber: ticketData.id,
        userId: ticketData.userId,
        executorId: claimer.id,
        metadata: {
          claimedAt: ticketData.claimedAt
        }
      }
    });
    
    return { success: true, ticketData };
    
  } catch (error) {
    logger.error('Error claiming ticket:', error);
    return { 
      success: false, 
      error: error.message || 'Failed to claim ticket' 
    };
  }
}

export async function reopenTicket(channel, reopener) {
  try {
    const ticketData = await getTicketData(channel.guild.id, channel.id);
    if (!ticketData) {
      return { success: false, error: 'This is not a ticket channel' };
    }
    
    if (ticketData.status !== 'closed') {
      return { 
        success: false, 
        error: 'This ticket is not currently closed' 
      };
    }
    
    // Update ticket data
    ticketData.status = 'open';
    ticketData.closedBy = null;
    ticketData.closedAt = null;
    ticketData.closeReason = null;
    
    await saveTicketData(channel.guild.id, channel.id, ticketData);
    
    // Restore the ticket creator's access
    try {
      const user = await channel.guild.members.fetch(ticketData.userId).catch(() => null);
      if (user) {
        await channel.permissionOverwrites.create(user, {
          ViewChannel: true,
          SendMessages: true,
          ReadMessageHistory: true,
          AttachFiles: true
        });
      }
    } catch (error) {
      logger.warn(`Could not restore access for user ${ticketData.userId}:`, error.message);
    }
    
    // Update ticket message
    const messages = await channel.messages.fetch();
    const ticketMessage = messages.find(m => 
      m.embeds.length > 0 && 
      m.embeds[0].title?.startsWith('Ticket #')
    );
    
    if (ticketMessage) {
      const embed = ticketMessage.embeds[0];
      const statusField = embed.fields?.find(f => f.name === 'Status');
      
      if (statusField) {
        statusField.value = '🟢 Open';
      }
      
      // Rebuild the action row with all buttons
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('ticket_close')
          .setLabel('Close Ticket')
          .setStyle(ButtonStyle.Danger)
          .setEmoji('🔒'),
        new ButtonBuilder()
          .setCustomId('ticket_claim')
          .setLabel(ticketData.claimedBy ? 'Claimed' : 'Claim')
          .setStyle(ticketData.claimedBy ? ButtonStyle.Secondary : ButtonStyle.Primary)
          .setEmoji(ticketData.claimedBy ? '🙋' : '🔑')
          .setDisabled(!!ticketData.claimedBy),
        new ButtonBuilder()
          .setCustomId('ticket_transcript')
          .setLabel('Transcript')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('📜')
      );
      
      await ticketMessage.edit({ 
        embeds: [embed],
        components: [row] 
      });
    }
    
    // Send reopen message
    const reopenEmbed = createEmbed({
      title: 'Ticket Reopened',
      description: `🔓 ${reopener} has reopened this ticket!`,
      color: '#2ecc71'
    });
    
    await channel.send({ embeds: [reopenEmbed] });
    
    return { success: true, ticketData };
    
  } catch (error) {
    logger.error('Error reopening ticket:', error);
    return { 
      success: false, 
      error: error.message || 'Failed to reopen ticket' 
    };
  }
}

export async function deleteTicket(channel, deleter) {
  try {
    const ticketData = await getTicketData(channel.guild.id, channel.id);
    if (!ticketData) {
      return { success: false, error: 'This is not a ticket channel' };
    }
    
    // Send final deletion message
    const deleteEmbed = createEmbed({
      title: 'Ticket Deleted',
      description: `🗑️ This ticket will be permanently deleted in 3 seconds.`,
      color: '#e74c3c',
      footer: { text: `Ticket ID: ${ticketData.id}` }
    });
    
    await channel.send({ embeds: [deleteEmbed] });
    
    // Log ticket deletion
    await logTicketEvent({
      client: channel.client,
      guildId: channel.guild.id,
      event: {
        type: 'delete',
        ticketId: channel.id,
        ticketNumber: ticketData.id,
        userId: ticketData.userId,
        executorId: deleter.id,
        metadata: {
          deletedAt: new Date().toISOString()
        }
      }
    });
    
    // Wait 3 seconds then delete the channel
    setTimeout(async () => {
      try {
        await channel.delete('Ticket deleted permanently');
        logger.info(`Deleted ticket channel ${channel.name} (${channel.id})`);
      } catch (deleteError) {
        logger.error(`Failed to delete ticket channel ${channel.id}:`, deleteError);
      }
    }, 3000);
    
    return { success: true, ticketData };
    
  } catch (error) {
    logger.error('Error deleting ticket:', error);
    return { 
      success: false, 
      error: error.message || 'Failed to delete ticket' 
    };
  }
}

export async function unclaimTicket(channel, unclaimer) {
  try {
    const ticketData = await getTicketData(channel.guild.id, channel.id);
    if (!ticketData) {
      return { success: false, error: 'This is not a ticket channel' };
    }
    
    if (!ticketData.claimedBy) {
      return { 
        success: false, 
        error: 'This ticket is not currently claimed' 
      };
    }
    
    // Only allow the claimer or admins to unclaim
    if (ticketData.claimedBy !== unclaimer.id && !unclaimer.permissions.has(PermissionFlagsBits.ManageChannels)) {
      return { 
        success: false, 
        error: 'You can only unclaim your own tickets or need Manage Channels permission.' 
      };
    }
    
    // Update ticket data
    const previousClaimer = ticketData.claimedBy;
    ticketData.claimedBy = null;
    ticketData.claimedAt = null;
    
    await saveTicketData(channel.guild.id, channel.id, ticketData);
    
    // Update ticket message
    const messages = await channel.messages.fetch();
    const ticketMessage = messages.find(m => 
      m.embeds.length > 0 && 
      m.embeds[0].title?.startsWith('Ticket #')
    );
    
    if (ticketMessage) {
      const embed = ticketMessage.embeds[0];
      const claimedField = embed.fields?.find(f => f.name === 'Claimed By');
      
      if (claimedField) {
        claimedField.value = 'Not claimed';
      }
      
      // Rebuild the action row with claim button re-enabled
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('ticket_close')
          .setLabel('Close Ticket')
          .setStyle(ButtonStyle.Danger)
          .setEmoji('🔒'),
        new ButtonBuilder()
          .setCustomId('ticket_claim')
          .setLabel('Claim')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('🙋'),
        new ButtonBuilder()
          .setCustomId('ticket_transcript')
          .setLabel('Transcript')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('📜')
      );
      
      await ticketMessage.edit({ 
        embeds: [embed],
        components: [row] 
      });
    }
    
    // Find and edit the claim embed message to remove the unclaim button
    const recentMessages = await channel.messages.fetch({ limit: 50 });
    const claimMessage = recentMessages.find(m => 
      m.embeds.length > 0 && 
      m.embeds[0].title === 'Ticket Claimed' &&
      m.components.length > 0 &&
      m.components[0].components.some(c => c.customId === 'ticket_unclaim')
    );
    
    if (claimMessage) {
      // Edit the claim message to remove the unclaim button and show unclaimed status
      const unclaimEmbed = createEmbed({
        title: 'Ticket Unclaimed',
        description: `🔓 ${unclaimer} has unclaimed this ticket!`,
        color: '#f39c12'
      });
      
      await claimMessage.edit({ 
        embeds: [unclaimEmbed],
        components: [] // Remove all components (unclaim button)
      });
    } else {
      // Fallback: send new message if claim message not found
      const unclaimEmbed = createEmbed({
        title: 'Ticket Unclaimed',
        description: `🔓 ${unclaimer} has unclaimed this ticket!`,
        color: '#f39c12'
      });
      
      await channel.send({ embeds: [unclaimEmbed] });
    }
    
    // Log ticket unclaim
    await logTicketEvent({
      client: channel.client,
      guildId: channel.guild.id,
      event: {
        type: 'unclaim',
        ticketId: channel.id,
        ticketNumber: ticketData.id,
        userId: ticketData.userId,
        executorId: unclaimer.id,
        metadata: {
          previousClaimer: previousClaimer
        }
      }
    });
    
    return { success: true, ticketData };
    
  } catch (error) {
    logger.error('Error unclaiming ticket:', error);
    return { 
      success: false, 
      error: error.message || 'Failed to unclaim ticket' 
    };
  }
}

async function getNextTicketNumber(guildId) {
  // Generate a random 3-digit number (100-999)
  const randomTicket = Math.floor(Math.random() * 900) + 100;
  return randomTicket.toString();
}

export async function updateTicketPriority(channel, priority, updater) {
  try {
    const ticketData = await getTicketData(channel.guild.id, channel.id);
    if (!ticketData) {
      return { success: false, error: 'This is not a ticket channel' };
    }
    
    const priorityInfo = PRIORITY_MAP[priority];
    if (!priorityInfo) {
      return { success: false, error: 'Invalid priority level' };
    }
    
    // Update ticket data
    ticketData.priority = priority;
    ticketData.priorityUpdatedBy = updater.id;
    ticketData.priorityUpdatedAt = new Date().toISOString();
    
    await saveTicketData(channel.guild.id, channel.id, ticketData);
    
    // Update channel name with priority emoji (except for 'none')
    if (priority !== 'none') {
      const priorityEmoji = priorityInfo.emoji;
      const currentName = channel.name;
      
      // Remove any existing priority emoji from channel name
      const cleanName = currentName.replace(/[🔵🟢🟡🔴⚪]/g, '').trim();
      
      // Add priority emoji at the beginning
      const newName = `${priorityEmoji} ${cleanName}`;
      
      try {
        await channel.setName(newName);
      } catch (nameError) {
        logger.warn(`Could not update channel name for priority: ${nameError.message}`);
      }
    }
    
    // Update ticket message
    const messages = await channel.messages.fetch();
    const ticketMessage = messages.find(m => 
      m.embeds.length > 0 && 
      m.embeds[0].title?.startsWith('Ticket #')
    );
    
    if (ticketMessage) {
      const embed = ticketMessage.embeds[0];
      
      // Create a new embed with updated priority
      const updatedEmbed = createEmbed({
        title: embed.title || 'Ticket',
        description: embed.description?.split('\n**Priority:**')[0] + `\n**Priority:** ${priorityInfo.emoji} ${priorityInfo.label}`,
        color: priorityInfo.color,
        fields: embed.fields || [],
        footer: embed.footer
      });
      
      await ticketMessage.edit({ embeds: [updatedEmbed] });
    }
    
    // Send priority update message
    const updateEmbed = createEmbed({
      title: 'Priority Updated',
      description: `📊 Ticket priority updated to **${priorityInfo.emoji} ${priorityInfo.label}** by ${updater}`,
      color: priorityInfo.color
    });
    
    await channel.send({ embeds: [updateEmbed] });
    
    // Log priority update
    await logTicketEvent({
      client: channel.client,
      guildId: channel.guild.id,
      event: {
        type: 'priority',
        ticketId: channel.id,
        ticketNumber: ticketData.id,
        userId: ticketData.userId,
        executorId: updater.id,
        priority: priority,
        metadata: {
          previousPriority: ticketData.priority,
          updatedAt: ticketData.priorityUpdatedAt
        }
      }
    });
    
    return { success: true, ticketData };
    
  } catch (error) {
    logger.error('Error updating ticket priority:', error);
    return { 
      success: false, 
      error: error.message || 'Failed to update ticket priority' 
    };
  }
}
