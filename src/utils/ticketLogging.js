import { EmbedBuilder, ChannelType } from 'discord.js';
import { getGuildConfig } from '../services/guildConfig.js';
import { logger } from './logger.js';

/**
 * Comprehensive ticket logging system with separate channels for different events
 * @param {Object} options - The log options
 * @param {import('discord.js').Client} options.client - The Discord client
 * @param {string} options.guildId - The guild ID
 * @param {Object} options.event - The ticket event details
 * @param {string} options.event.type - The type of ticket event (open, close, claim, unclaim, transcript, priority, etc.)
 * @param {string} [options.event.ticketId] - The ticket ID/channel
 * @param {string} [options.event.ticketNumber] - The ticket number
 * @param {string} [options.event.userId] - The user who created/owns the ticket
 * @param {string} [options.event.executorId] - The user who performed the action
 * @param {string} [options.event.reason] - The reason for the action
 * @param {string} [options.event.priority] - The ticket priority
 * @param {Object} [options.event.metadata] - Additional metadata
 * @param {import('discord.js').AttachmentBuilder[]} [options.event.attachments] - File attachments (for transcripts)
 * @returns {Promise<void>}
 */
export async function logTicketEvent({ client, guildId, event }) {
  try {
    const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) {
      logger.warn(`logTicketEvent invoked without valid guild: ${guildId}`);
      return;
    }

    const config = await getGuildConfig(client, guildId);
    
    // Get the appropriate channel based on event type
    const logChannelId = getLogChannelForEventType(config, event.type);
    if (!logChannelId) {
      // Logging is disabled for this event type
      return;
    }

    const channel = guild.channels.cache.get(logChannelId) || await guild.channels.fetch(logChannelId).catch(() => null);
    if (!channel) {
      logger.warn(`Ticket log channel not found: ${logChannelId} for event type: ${event.type}`);
      return;
    }

    // Check bot permissions
    const permissions = channel.permissionsFor(guild.members.me);
    if (!permissions.has(['SendMessages', 'EmbedLinks'])) {
      logger.warn(`Missing permissions in ticket log channel: ${logChannelId}`);
      return;
    }

    // Create the log embed
    const embed = await createTicketLogEmbed(guild, event);
    
    // Prepare message options
    const messageOptions = { embeds: [embed] };
    
    // Add attachments if provided (for transcripts)
    if (event.attachments && event.attachments.length > 0) {
      messageOptions.files = event.attachments;
    }

    await channel.send(messageOptions);
    logger.info(`Ticket event logged: ${event.type} in guild ${guildId}`);

  } catch (error) {
    logger.error('Error logging ticket event:', error);
  }
}

/**
 * Get the appropriate log channel ID for a specific event type
 * @param {Object} config - Guild configuration
 * @param {string} eventType - The event type
 * @returns {string|null} Channel ID or null if logging disabled
 */
function getLogChannelForEventType(config, eventType) {
  const ticketLogging = config.ticketLogging || {};
  
  switch (eventType) {
    case 'transcript':
      return ticketLogging.transcriptChannelId || config.logChannelId;
    
    case 'open':
    case 'close':
    case 'delete':
      return ticketLogging.lifecycleChannelId || config.logChannelId;
    
    case 'claim':
    case 'unclaim':
    case 'priority':
      return ticketLogging.lifecycleChannelId || config.logChannelId;
    
    default:
      return config.logChannelId;
  }
}

/**
 * Create a log embed for ticket events
 * @param {import('discord.js').Guild} guild - The guild
 * @param {Object} event - The event details
 * @returns {Promise<EmbedBuilder>}
 */
async function createTicketLogEmbed(guild, event) {
  const embed = new EmbedBuilder();
  
  // Set color based on event type
  const eventColors = {
    open: 0x2ecc71,      // Green
    close: 0xe74c3c,     // Red
    delete: 0x8b0000,    // Dark Red
    claim: 0x3498db,     // Blue
    unclaim: 0xf39c12,   // Orange
    priority: 0x9b59b6,  // Purple
    transcript: 0x1abc9c // Teal
  };
  
  embed.setColor(eventColors[event.type] || 0x95a5a6);
  
  // Set title and description based on event type
  const eventInfo = getEventDisplayInfo(event);
  embed.setTitle(eventInfo.title);
  embed.setDescription(eventInfo.description);
  
  // Add timestamp
  embed.setTimestamp();
  
  // Add footer with ticket ID if available
  if (event.ticketId || event.ticketNumber) {
    embed.setFooter({ 
      text: `Ticket ID: ${event.ticketNumber || event.ticketId || 'Unknown'}` 
    });
  }
  
  // Build fields
  const fields = [];
  
  // Add user information
  if (event.userId) {
    try {
      const user = await guild.client.users.fetch(event.userId).catch(() => null);
      if (user) {
        fields.push({
          name: '👤 Ticket User',
          value: `${user.tag} (${event.userId})`,
          inline: true
        });
      }
    } catch (error) {
      fields.push({
        name: '👤 Ticket User',
        value: `<@${event.userId}> (${event.userId})`,
        inline: true
      });
    }
  }
  
  // Add executor information
  if (event.executorId) {
    try {
      const executor = await guild.client.users.fetch(event.executorId).catch(() => null);
      if (executor) {
        fields.push({
          name: '🔨 Executed By',
          value: `${executor.tag} (${event.executorId})`,
          inline: true
        });
      }
    } catch (error) {
      fields.push({
        name: '🔨 Executed By',
        value: `<@${event.executorId}> (${event.executorId})`,
        inline: true
      });
    }
  }
  
  // Add reason if provided
  if (event.reason) {
    fields.push({
      name: '📝 Reason',
      value: event.reason,
      inline: false
    });
  }
  
  // Add priority if provided
  if (event.priority) {
    const priorityEmojis = {
      none: '⚪',
      low: '🔵',
      medium: '🟢',
      high: '🟡',
      urgent: '🔴'
    };
    
    fields.push({
      name: '🎯 Priority',
      value: `${priorityEmojis[event.priority] || '⚪'} ${event.priority.charAt(0).toUpperCase() + event.priority.slice(1)}`,
      inline: true
    });
  }
  
  // Add metadata if provided
  if (event.metadata) {
    Object.entries(event.metadata).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        fields.push({
          name: `📊 ${key.charAt(0).toUpperCase() + key.slice(1)}`,
          value: String(value),
          inline: true
        });
      }
    });
  }
  
  embed.addFields(fields);
  
  return embed;
}

/**
 * Get display information for different event types
 * @param {Object} event - The event details
 * @returns {Object} { title: string, description: string }
 */
function getEventDisplayInfo(event) {
  const ticketRef = event.ticketNumber ? `#${event.ticketNumber}` : event.ticketId ? `<#${event.ticketId}>` : 'Unknown';
  
  const eventMessages = {
    open: {
      title: '🎫 Ticket Opened',
      description: `A new ticket has been created: ${ticketRef}`
    },
    close: {
      title: '🔒 Ticket Closed',
      description: `Ticket ${ticketRef} has been closed`
    },
    delete: {
      title: '🗑️ Ticket Deleted',
      description: `Ticket ${ticketRef} has been permanently deleted`
    },
    claim: {
      title: '🙋 Ticket Claimed',
      description: `Ticket ${ticketRef} has been claimed`
    },
    unclaim: {
      title: '🔓 Ticket Unclaimed',
      description: `Ticket ${ticketRef} has been unclaimed`
    },
    priority: {
      title: '🎯 Priority Updated',
      description: `Priority changed for ticket ${ticketRef}`
    },
    transcript: {
      title: '📜 Transcript Created',
      description: `Transcript generated for ticket ${ticketRef}`
    }
  };
  
  return eventMessages[event.type] || {
    title: '🎫 Ticket Event',
    description: `An event occurred for ticket ${ticketRef}`
  };
}

/**
 * Get current ticket logging configuration
 * @param {import('discord.js').Client} client - The Discord client
 * @param {string} guildId - The guild ID
 * @returns {Promise<Object>} Current configuration
 */
export async function getTicketLoggingConfig(client, guildId) {
  const config = await getGuildConfig(client, guildId);
  return {
    enabled: !!(config.ticketLogging?.lifecycleChannelId || config.ticketLogging?.transcriptChannelId),
    lifecycleChannelId: config.ticketLogging?.lifecycleChannelId || null,
    transcriptChannelId: config.ticketLogging?.transcriptChannelId || null,
    fallbackChannelId: config.logChannelId || null
  };
}

/**
 * Validate a channel for ticket logging
 * @param {import('discord.js').GuildChannel} channel - The channel to validate
 * @param {import('discord.js').GuildMember} botMember - The bot's guild member
 * @returns {Object} Validation result
 */
export function validateLogChannel(channel, botMember) {
  if (!channel || channel.type !== ChannelType.GuildText) {
    return {
      valid: false,
      error: 'Channel must be a text channel.'
    };
  }
  
  const permissions = channel.permissionsFor(botMember);
  const requiredPermissions = ['SendMessages', 'EmbedLinks'];
  
  const missing = requiredPermissions.filter(perm => !permissions.has(perm));
  
  if (missing.length > 0) {
    return {
      valid: false,
      error: `Missing permissions: ${missing.join(', ')}`
    };
  }
  
  return { valid: true };
}
