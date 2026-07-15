import { EmbedBuilder, ChannelType, PermissionFlagsBits } from 'discord.js';
import { getGuildConfig } from './guildConfig.js';
import { logger } from '../utils/logger.js';






const EVENT_TYPES = {
  
  MODERATION_BAN: 'moderation.ban',
  MODERATION_KICK: 'moderation.kick',
  MODERATION_MUTE: 'moderation.mute',
  MODERATION_WARN: 'moderation.warn',
  MODERATION_PURGE: 'moderation.purge',
  MODERATION_UNBAN: 'moderation.unban',
  MODERATION_LOCK: 'moderation.lock',
  MODERATION_UNLOCK: 'moderation.unlock',
  
  
  TICKET_CREATE: 'ticket.create',
  TICKET_CLOSE: 'ticket.close',
  TICKET_CLAIM: 'ticket.claim',
  TICKET_PRIORITY: 'ticket.priority',
  TICKET_TRANSCRIPT: 'ticket.transcript',
  TICKET_DELETE: 'ticket.delete',
  
  
  LEVELING_LEVELUP: 'leveling.levelup',
  LEVELING_MILESTONE: 'leveling.milestone',
  
  
  MESSAGE_DELETE: 'message.delete',
  MESSAGE_EDIT: 'message.edit',
  MESSAGE_BULK_DELETE: 'message.bulkdelete',
  
  
  ROLE_CREATE: 'role.create',
  ROLE_DELETE: 'role.delete',
  ROLE_UPDATE: 'role.update',
  
  
  MEMBER_JOIN: 'member.join',
  MEMBER_LEAVE: 'member.leave',
  MEMBER_NAME_CHANGE: 'member.namechange',
  VERIFICATION: 'verification.complete',
  SUGGESTION: 'suggestion.create',
  REPORT: 'report.create',
  CONTEST_ACTION: 'contest.action',
  SETTINGS_CHANGE: 'settings.change',
  COMMAND_ERROR: 'command.error',
  
  
  REACTION_ROLE_ADD: 'reactionrole.add',
  REACTION_ROLE_REMOVE: 'reactionrole.remove',
  REACTION_ROLE_CREATE: 'reactionrole.create',
  REACTION_ROLE_DELETE: 'reactionrole.delete',
  REACTION_ROLE_UPDATE: 'reactionrole.update',
  
  
  GIVEAWAY_CREATE: 'giveaway.create',
  GIVEAWAY_WINNER: 'giveaway.winner',
  GIVEAWAY_REROLL: 'giveaway.reroll',
  GIVEAWAY_DELETE: 'giveaway.delete',
  
  
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
  'giveaway.delete': 0xE74C3C,
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
  'giveaway.delete': '🗑️',
  'counter.update': '📊',
};











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
      return { ok: false, reason: 'guild_not_found' };
    }

    const config = await getGuildConfig(client, guildId);

    
    const ignoredUsers = config.logIgnore?.users || [];
    const ignoredChannels = config.logIgnore?.channels || [];
    if (data?.userId && ignoredUsers.includes(data.userId)) {
      return { ok: false, reason: 'ignored' };
    }
    if (data?.channelId && ignoredChannels.includes(data.channelId)) {
      return { ok: false, reason: 'ignored' };
    }
    
    
    if (!isLoggingEnabled(config, eventType)) {
      return { ok: false, reason: 'disabled' };
    }

    
    const logChannelId = getLogChannelForEvent(config, eventType);
    if (!logChannelId) {
      logger.warn(`Log channel is not configured for guild ${guildId}. Configure it with /settings channel.`);
      return { ok: false, reason: 'not_configured' };
    }

    const channel = guild.channels.cache.get(logChannelId) || 
      await guild.channels.fetch(logChannelId).catch(() => null);
    
    if (!channel || channel.type !== ChannelType.GuildText) {
      logger.warn(`logEvent: Invalid log channel ${logChannelId} for guild ${guildId}`);
      return { ok: false, reason: 'channel_not_found' };
    }

    const permissions = channel.permissionsFor(guild.members.me);
    const requiredPermissions = [
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.EmbedLinks,
    ];
    if (!permissions || !permissions.has(requiredPermissions)) {
      logger.warn(`logEvent: Missing permissions in channel ${logChannelId}`);
      return { ok: false, reason: 'missing_permissions' };
    }

    const embed = createLogEmbed(guild, eventType, data);
    
    const messageOptions = { embeds: [embed] };
    if (attachments.length > 0) {
      messageOptions.files = attachments;
    }

    await channel.send(messageOptions);
    logger.info(`Event logged: ${eventType} in guild ${guildId}`);
    return { ok: true };

  } catch (error) {
    logger.error('Error in logEvent', { error, guildId, eventType });
    return { ok: false, reason: 'send_failed' };
  }
}







function isLoggingEnabled(config, eventType) {
  if (config.enableLogging === false) {
    return false;
  }

  // Legacy guilds may only have logChannelId. Treat logging as enabled unless
  // it was explicitly disabled, so existing configuration keeps working.
  if (config.logging?.enabled === false) {
    return false;
  }

  if (!eventType || typeof eventType !== 'string') {
    logger.debug('isLoggingEnabled called with invalid eventType', { eventType });
    return false;
  }

  const category = eventType.split('.')[0];
  const enabledEvents = config.logging.enabledEvents || {};

  
  if (enabledEvents[eventType] === false) {
    return false;
  }

  
  if (enabledEvents[`${category}.*`] === false) {
    return false;
  }

  return true;
}







function getLogChannelForEvent(config, eventType) {
  const logging = config.logging || {};
  
  
  if (logging.channelId) {
    return logging.channelId;
  }

  
  if (config.logChannelId) {
    return config.logChannelId;
  }

  return null;
}








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

  
  const title = String(data?.title || `${icon} ${formatEventType(eventType)}`).slice(0, 256);
  embed.setTitle(title);

  
  if (data.description) {
    embed.setDescription(String(data.description).slice(0, 4096));
  }

  
  if (data.fields && Array.isArray(data.fields)) {
    embed.addFields(data.fields.slice(0, 25).map(field => ({
      name: String(field.name || 'פרט').slice(0, 256),
      value: String(field.value ?? '—').slice(0, 1024),
      inline: Boolean(field.inline),
    })));
  }

  return embed;
}

// Stable API for commands and services. Logging failures are intentionally
// returned to the caller instead of being thrown into the original action.
export async function sendLog(guild, logType, title, description, fields = [], options = {}) {
  if (!guild?.client || !guild.id) return { ok: false, reason: 'guild_not_found' };
  return logEvent({
    client: guild.client,
    guildId: guild.id,
    eventType: logType,
    data: { title, description, fields, ...options.data },
    attachments: options.attachments || [],
  });
}






function formatEventType(eventType) {
  if (!eventType || typeof eventType !== 'string') {
    return 'Unknown Event';
  }

  return eventType
    .split('.')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}







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









export async function toggleEventLogging(client, guildId, eventTypes, enabled) {
  try {
    const { updateGuildConfig } = await import('./guildConfig.js');
    const config = await getGuildConfig(client, guildId);
    
    const logging = config.logging || { enabled: false, enabledEvents: {} };
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








export async function setLoggingChannel(client, guildId, channelId) {
  try {
    const { updateGuildConfig } = await import('./guildConfig.js');
    const config = await getGuildConfig(client, guildId);
    
    const logging = config.logging || { enabled: false, enabledEvents: {} };
    logging.channelId = channelId;
    logging.enabled = true;

    await updateGuildConfig(client, guildId, { logging });
    return true;
  } catch (error) {
    logger.error('Error setting logging channel:', error);
    return false;
  }
}








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
