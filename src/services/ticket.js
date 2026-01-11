import { 
  ChannelType, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  EmbedBuilder,
  PermissionFlagsBits
} from 'discord.js';
import { 
  getGuildConfig,
  getTicketData,
  saveTicketData,
  deleteTicketData
} from './database.js';
import { logger } from '../utils/logger.js';
import { createEmbed, errorEmbed } from '../utils/embeds.js';

// Priority mapping
const PRIORITY_MAP = {
  low: { name: '🔵 LOW', color: '#3498db', emoji: '🔵', label: 'Low' },
  medium: { name: '🟢 MEDIUM', color: '#2ecc71', emoji: '🟢', label: 'Medium' },
  high: { name: '🟡 HIGH', color: '#f1c40f', emoji: '🟡', label: 'High' },
  urgent: { name: '🔴 URGENT', color: '#e74c3c', emoji: '🔴', label: 'Urgent' }
};

export async function createTicket(guild, member, categoryId, reason = 'No reason provided', priority = 'medium') {
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
    const channelName = (ticketConfig.ticketName || 'ticket-{number}')
      .replace('{number}', ticketNumber)
      .replace('{username}', member.user.username)
      .substring(0, 32); // Max channel name length is 32
    
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
      priority: priority || 'medium',
      reason,
    };
    
    await saveTicketData(guild.id, channel.id, ticketData);
    
    // Send ticket message
    const priorityInfo = PRIORITY_MAP[priority] || PRIORITY_MAP.medium;
    
    const embed = createEmbed({
      title: `Ticket #${ticketNumber}`,
      description: `${member}, thanks for creating a ticket!\n\n**Reason:** ${reason}\n**Priority:** ${priorityInfo.emoji} ${priorityInfo.label}`,
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
    
    await channel.send({ 
      content: `${member} ${ticketConfig.supportRoles?.map(r => `<@&${r}>`).join(' ')}`,
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
    await channel.permissionOverwrites.edit(ticketData.userId, {
      ViewChannel: false,
      SendMessages: false,
    });
    
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
      
      await ticketMessage.edit({ 
        embeds: [embed],
        components: [] // Remove all buttons
      });
    }
    
    // Send close message
    const closeEmbed = createEmbed({
      title: 'Ticket Closed',
      description: `This ticket has been closed by ${closer}.\n**Reason:** ${reason}`,
      color: '#e74c3c',
      footer: { text: `Ticket ID: ${ticketData.id}` }
    });
    
    await channel.send({ embeds: [closeEmbed] });
    
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
      
      const claimButton = ticketMessage.components[0]?.components?.find(
        b => b.customId === 'ticket_claim'
      );
      
      if (claimButton) {
        claimButton.setLabel('Claimed')
          .setDisabled(true)
          .setStyle(ButtonStyle.Secondary);
      }
      
      await ticketMessage.edit({ 
        embeds: [embed],
        components: ticketMessage.components 
      });
    }
    
    // Send claim message
    const claimEmbed = createEmbed({
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
  const key = `guild:${guildId}:ticket_counter`;
  const current = await db.get(key) || 0;
  const next = current + 1;
  await db.set(key, next);
  return next.toString().padStart(4, '0');
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
    
    // Update ticket message
    const messages = await channel.messages.fetch();
    const ticketMessage = messages.find(m => 
      m.embeds.length > 0 && 
      m.embeds[0].title?.startsWith('Ticket #')
    );
    
    if (ticketMessage) {
      const embed = ticketMessage.embeds[0];
      embed.color = priorityInfo.color;
      
      const description = embed.description?.split('\n**Priority:**')[0];
      if (description) {
        embed.description = `${description}\n**Priority:** ${priorityInfo.emoji} ${priorityInfo.label}`;
      }
      
      await ticketMessage.edit({ embeds: [embed] });
    }
    
    // Send priority update message
    const updateEmbed = createEmbed({
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
