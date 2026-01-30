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

// Priority mapping
const PRIORITY_MAP = {
  none: { name: '⚪ NONE', color: '#95a5a6', emoji: '⚪', label: 'None' },
  low: { name: '🔵 LOW', color: '#3498db', emoji: '🔵', label: 'Low' },
  medium: { name: '🟢 MEDIUM', color: '#2ecc71', emoji: '🟢', label: 'Medium' },
  high: { name: '🟡 HIGH', color: '#f1c40f', emoji: '🟡', label: 'High' },
  urgent: { name: '🔴 URGENT', color: '#e74c3c', emoji: '🔴', label: 'Urgent' }
};

export async function createTicket(guild, member, categoryId, reason = 'No reason provided', priority = 'none') {
  try {
    const config = await getGuildConfig({}, guild.id);
    const ticketConfig = config.tickets || {};
    
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
    
    // Update ticket data
    ticketData.status = 'closed';
    ticketData.closedBy = closer.id;
    ticketData.closedAt = new Date().toISOString();
    ticketData.closeReason = reason;
    
    await saveTicketData(channel.guild.id, channel.id, ticketData);
    
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
    
    // Send close message
    const closeEmbed = createEmbed({
      title: 'Ticket Closed',
      description: `This ticket has been closed by ${closer}.\n**Reason:** ${reason}\n\n📋 This channel will be deleted in 5 seconds.`,
      color: '#e74c3c',
      footer: { text: `Ticket ID: ${ticketData.id}` }
    });
    
    await channel.send({ embeds: [closeEmbed] });
    
    // Wait 5 seconds before deleting the channel to allow users to see the close message
    setTimeout(async () => {
      try {
        await channel.delete('Ticket closed and archived');
        logger.info(`Deleted ticket channel ${channel.name} (${channel.id})`);
      } catch (deleteError) {
        logger.error(`Failed to delete ticket channel ${channel.id}:`, deleteError);
      }
    }, 5000);
    
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
    
    // Send claim message
    const claimEmbed = createEmbed({
      title: 'Ticket Claimed',
      description: `🎉 ${claimer} has claimed this ticket!`,
      color: '#2ecc71'
    });
    
    await channel.send({ embeds: [claimEmbed] });
    
    return { success: true, ticketData };
    
  } catch (error) {
    logger.error('Error claiming ticket:', error);
    return { 
      success: false, 
      error: error.message || 'Failed to claim ticket' 
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
    
    return { success: true, ticketData };
    
  } catch (error) {
    logger.error('Error updating ticket priority:', error);
    return { 
      success: false, 
      error: error.message || 'Failed to update ticket priority' 
    };
  }
}
