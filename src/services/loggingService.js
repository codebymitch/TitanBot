import { EmbedBuilder, ChannelType } from 'discord.js';
import { getGuildConfig } from './guildConfig.js';
import { logger } from '../utils/logger.js';

/**
 * Unified logging service for all bot events
 * Supports: Moderation, Tickets, Leveling, Messages, Roles, Reaction Roles, Giveaways, Counter, Join/Leave
 */

const EVENT_TYPES = {
  // Moderation
  MODERATION_BAN: 'moderation.ban',
  MODERATION_KICK: 'moderation.kick',
  MODERATION_MUTE: 'moderation.mute',
  MODERATION_WARN: 'moderation.warn',
  MODERATION_PURGE: 'moderation.purge',
  
  // Tickets
  TICKET_CREATE: 'ticket.create',
  TICKET_CLOSE: 'ticket.close',
  TICKET_CLAIM: 'ticket.claim',
  TICKET_PRIORITY: 'ticket.priority',
  TICKET_TRANSCRIPT: 'ticket.transcript',
  TICKET_DELETE: 'ticket.delete',
  
  // Leveling
  LEVELING_LEVELUP: 'leveling.levelup',
  LEVELING_MILESTONE: 'leveling.milestone',
  
  // Messages
  MESSAGE_DELETE: 'message.delete',
  MESSAGE_EDIT: 'message.edit',
  MESSAGE_BULK_DELETE: 'message.bulkdelete',
  
  // Roles
  ROLE_CREATE: 'role.create',
  ROLE_DELETE: 'role.delete',
  ROLE_UPDATE: 'role.update',
  
  // Members
  MEMBER_JOIN: 'member.join',
  MEMBER_LEAVE: 'member.leave',
  MEMBER_NAME_CHANGE: 'member.namechange',
  
  // Reaction Roles
  REACTION_ROLE_ADD: 'reactionrole.add',
  REACTION_ROLE_REMOVE: 'reactionrole.remove',
  REACTION_ROLE_CREATE: 'reactionrole.create',
  REACTION_ROLE_DELETE: 'reactionrole.delete',
  REACTION_ROLE_UPDATE: 'reactionrole.update',
  
  // Giveaway
  GIVEAWAY_CREATE: 'giveaway.create',
  GIVEAWAY_WINNER: 'giveaway.winner',
  GIVEAWAY_REROLL: 'giveaway.reroll',
  
  // Counter
  COUNTER_UPDATE: 'counter.update'
};

const EVENT_COLORS = {
  'moderation.ban': 0x721919,
  'moderation.kick': 0xFFA500,
  'moderation.mute': 0xF1C40F,
  'moderation.warn': 0xFEE75C,
  'moderation.purge': 0xE67E22,
  'ticket.create': 0x2ecc71,
  'ticket.close': 0xe74c3c,
  'ticket.claim': 0x3498db,
  'ticket.priority': 0x9b59b6,
  'ticket.transcript': 0x1abc9c,
  'ticket.delete': 0x8b0000,
  'leveling.levelup': 0x00ff00,
  'leveling.milestone': 0xFFD700,
  'message.delete': 0x8b0000,
  'message.edit': 0xFFA500,
  'message.bulkdelete': 0xFF0000,
  'role.create': 0x2ecc71,
  'role.delete': 0xe74c3c,
  'role.update': 0x3498db,
  'member.join': 0x2ecc71,
  'member.leave': 0xe74c3c,
  'member.namechange': 0x3498db,
  'reactionrole.add': 0x2ecc71,
  'reactionrole.remove': 0xe74c3c,
  'reactionrole.create': 0x3498db,
  'reactionrole.delete': 0x8b0000,
  'reactionrole.update': 0xFFA500,
  'giveaway.create': 0x57F287,
  'giveaway.winner': 0xFEE75C,
  'giveaway.reroll': 0x3498DB,
  'counter.update': 0x0099ff,
};

const EVENT_ICONS = {
  'moderation.ban': '🔨',
  'moderation.kick': '👢',
  'moderation.mute': '🔇',
  'moderation.warn': '⚠️',
  'moderation.purge': '🗑️',
  'ticket.create': '🎫',
  'ticket.close': '🔒',
  'ticket.claim': '🙋',
  'ticket.priority': '🎯',
  'ticket.transcript': '📜',
  'ticket.delete': '🗑️',
  'leveling.levelup': '📈',
  'leveling.milestone': '🏆',
  'message.delete': '❌',
  'message.edit': '✏️',
  'message.bulkdelete': '🗑️',
  'role.create': '➕',
  'role.delete': '➖',
  'role.update': '🔄',
  'member.join': '👋',
  'member.leave': '👋',
  'member.namechange': '🏷️',
  'reactionrole.add': '✅',
  'reactionrole.remove': '❌',
  'reactionrole.create': '🎭',
  'reactionrole.delete': '🗑️',
  'reactionrole.update': '🔄',
  'giveaway.create': '🎁',
  'giveaway.winner': '🎉',
  'giveaway.reroll': '🔄',
  'counter.update': '📊',
};

/**
 * Main logging function - routes to appropriate channel and creates embed
 * @param {Object} options
 * @param {import('discord.js').Client} options.client
 * @param {string} options.guildId
 * @param {string} options.eventType - One of EVENT_TYPES
 * @param {Object} options.data - Event-specific data
 * @param {import('discord.js').AttachmentBuilder[]} [options.attachments] - Optional attachments
 * @returns {Promise<void>}
 */
export async function logEvent({
  client,
  guildId,
  eventType,
  data,
  attachments = []
}) {
  try {
    const guild = client.guilds.cache.get(guildId) || 
      await client.guilds.fetch(guildId).catch(() => null);
    
    if (!guild) {
      logger.warn(`logEvent: Guild not found: ${guildId}`);
      return;
    }

    const config = await getGuildConfig(client, guildId);

    // Respect log ignore lists when a user or channel is provided
    const ignoredUsers = config.logIgnore?.users || [];
    const ignoredChannels = config.logIgnore?.channels || [];
    if (data?.userId && ignoredUsers.includes(data.userId)) {
      return;
    }
    if (data?.channelId && ignoredChannels.includes(data.channelId)) {
      return;
    }
    
    // Check if logging is enabled for this event type
    if (!isLoggingEnabled(config, eventType)) {
      return;
    }

    // Get the appropriate log channel
    const logChannelId = getLogChannelForEvent(config, eventType);
    if (!logChannelId) {
      return;
    }

    const channel = guild.channels.cache.get(logChannelId) || 
      await guild.channels.fetch(logChannelId).catch(() => null);
    
    if (!channel || channel.type !== ChannelType.GuildText) {
      logger.warn(`logEvent: Invalid log channel ${logChannelId} for guild ${guildId}`);
      return;
    }

    const permissions = channel.permissionsFor(guild.members.me);
    if (!permissions || !permissions.has(['SendMessages', 'EmbedLinks'])) {
      logger.warn(`logEvent: Missing permissions in channel ${logChannelId}`);
      return;
    }

    const embed = createLogEmbed(guild, eventType, data);
    
    const messageOptions = { embeds: [embed] };
    if (attachments.length > 0) {
      messageOptions.files = attachments;
    }

    await channel.send(messageOptions);
    logger.info(`Event logged: ${eventType} in guild ${guildId}`);

  } catch (error) {
    logger.error(`Error in logEvent:`, error);
  }
}

/**
 * Check if logging is enabled for a specific event type
 * @param {Object} config - Guild configuration
 * @param {string} eventType - Event type to check
 * @returns {boolean}
 */
function isLoggingEnabled(config, eventType) {
  if (config.enableLogging === false) {
    return false;
  }

  if (!config.logging || !config.logging.enabled) {
    return false;
  }

  const category = eventType.split('.')[0];
  const enabledEvents = config.logging.enabledEvents || {};

  // Default to enabled if not explicitly disabled
  if (enabledEvents[eventType] === false) {
    return false;
  }

  // Check category-level settings
  if (enabledEvents[`${category}.*`] === false) {
    return false;
  }

  return true;
}

/**
 * Get the log channel ID for a specific event type
 * @param {Object} config - Guild configuration
 * @param {string} eventType - Event type
 * @returns {string|null}
 */
function getLogChannelForEvent(config, eventType) {
  const logging = config.logging || {};
  
  // Priority: specific channel > general log channel
  if (logging.channelId) {
    return logging.channelId;
  }

  // Fallback to general log channel
  if (config.logChannelId) {
    return config.logChannelId;
  }

  return null;
}

/**
 * Create a log embed for any event
 * @param {import('discord.js').Guild} guild
 * @param {string} eventType
 * @param {Object} data
 * @returns {EmbedBuilder}
 */
function createLogEmbed(guild, eventType, data) {
  const embed = new EmbedBuilder();
  const color = EVENT_COLORS[eventType] || 0x0099ff;
  const icon = EVENT_ICONS[eventType] || '📌';
  
  embed.setColor(color);
  embed.setTimestamp();
  embed.setFooter({ 
    text: `Guild: ${guild.name}`,
    iconURL: guild.iconURL()
  });

  // Set title
  const title = data.title || `${icon} ${formatEventType(eventType)}`;
  embed.setTitle(title);

  // Set description
  if (data.description) {
    embed.setDescription(data.description);
  }

  // Add fields
  if (data.fields && Array.isArray(data.fields)) {
    embed.addFields(data.fields);
  }

  return embed;
}

/**
 * Format event type to readable title
 * @param {string} eventType
 * @returns {string}
 */
function formatEventType(eventType) {
  return eventType
    .split('.')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

/**
 * Get logging configuration status for a guild
 * @param {Object} client
 * @param {string} guildId
 * @returns {Promise<Object>}
 */
export async function getLoggingStatus(client, guildId) {
  const config = await getGuildConfig(client, guildId);
  const logging = config.logging || {};

  return {
    enabled: logging.enabled || false,
    channelId: logging.channelId || null,
    enabledEvents: logging.enabledEvents || {},
    allEventTypes: EVENT_TYPES
  };
}

/**
 * Toggle logging for specific event types
 * @param {Object} client
 * @param {string} guildId
 * @param {string|string[]} eventTypes - Event type(s) to toggle
 * @param {boolean} enabled - Enable or disable
 * @returns {Promise<boolean>}
 */
export async function toggleEventLogging(client, guildId, eventTypes, enabled) {
  try {
    const { updateGuildConfig } = await import('./guildConfig.js');
    const config = await getGuildConfig(client, guildId);
    
    const logging = config.logging || { enabled: true, enabledEvents: {} };
    const types = Array.isArray(eventTypes) ? eventTypes : [eventTypes];
    
    types.forEach(type => {
      if (type.endsWith('.*')) {
        const category = type.replace('.*', '');
        const matchingTypes = Object.values(EVENT_TYPES).filter(
          eventType => eventType.startsWith(`${category}.`)
        );
        matchingTypes.forEach(eventType => {
          logging.enabledEvents[eventType] = enabled;
        });
        logging.enabledEvents[type] = enabled;
      } else {
        logging.enabledEvents[type] = enabled;
      }
    });

    await updateGuildConfig(client, guildId, { logging });
    return true;
  } catch (error) {
    logger.error('Error toggling event logging:', error);
    return false;
  }
}

/**
 * Set log channel for events
 * @param {Object} client
 * @param {string} guildId
 * @param {string} channelId
 * @returns {Promise<boolean>}
 */
export async function setLoggingChannel(client, guildId, channelId) {
  try {
    const { updateGuildConfig } = await import('./guildConfig.js');
    const config = await getGuildConfig(client, guildId);
    
    const logging = config.logging || { enabled: true, enabledEvents: {} };
    logging.channelId = channelId;
    logging.enabled = true;

    await updateGuildConfig(client, guildId, { logging });
    return true;
  } catch (error) {
    logger.error('Error setting logging channel:', error);
    return false;
  }
}

/**
 * Enable or disable logging globally
 * @param {Object} client
 * @param {string} guildId
 * @param {boolean} enabled
 * @returns {Promise<boolean>}
 */
export async function setLoggingEnabled(client, guildId, enabled) {
  try {
    const { updateGuildConfig } = await import('./guildConfig.js');
    const config = await getGuildConfig(client, guildId);
    
    const logging = config.logging || { enabledEvents: {} };
    logging.enabled = enabled;

    await updateGuildConfig(client, guildId, { logging });
    return true;
  } catch (error) {
    logger.error('Error setting logging enabled:', error);
    return false;
  }
}

export { EVENT_TYPES, EVENT_COLORS, EVENT_ICONS };
