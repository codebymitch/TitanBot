import { EmbedBuilder, ChannelType } from 'discord.js';
import { getGuildConfig } from './guildConfigService.js';
import { logger } from '../utils/logger.js';

const EVENT_TYPES = {

  MODERATION_BAN: 'moderation.ban',
  MODERATION_KICK: 'moderation.kick',
  MODERATION_MUTE: 'moderation.mute',
  MODERATION_WARN: 'moderation.warn',
  MODERATION_PURGE: 'moderation.purge',

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

    const guild = client.guilds.cache.get(guildId);

    if (!guild) return;

    const config = await getGuildConfig(client.db, guildId);

    // 🔥 LOGS APAGADOS
    if (!config.logging_enabled) return;

    // 🔥 CANAL LOGS
    const logChannelId = config.log_channel;

    if (!logChannelId) return;

    const channel = guild.channels.cache.get(logChannelId);

    if (!channel || channel.type !== ChannelType.GuildText) {
      return;
    }

    const embed = createLogEmbed(
      guild,
      eventType,
      data
    );

    const messageOptions = {
      embeds: [embed]
    };

    if (attachments.length > 0) {
      messageOptions.files = attachments;
    }

    await channel.send(messageOptions);

  } catch (error) {

    logger.error('Error in logEvent:', error);

  }
}

function createLogEmbed(guild, eventType, data) {

  const embed = new EmbedBuilder();

  const color =
    EVENT_COLORS[eventType] || 0x0099ff;

  const icon =
    EVENT_ICONS[eventType] || '📌';

  embed.setColor(color);

  embed.setTitle(
    data.title ||
    `${icon} ${formatEventType(eventType)}`
  );

  if (data.description) {
    embed.setDescription(data.description);
  }

  if (
    data.fields &&
    Array.isArray(data.fields)
  ) {
    embed.addFields(data.fields);
  }

  embed.setFooter({
    text: guild.name,
    iconURL: guild.iconURL()
  });

  embed.setTimestamp();

  return embed;
}

function formatEventType(eventType) {

  return eventType
    .split('.')
    .map(
      part =>
        part.charAt(0).toUpperCase() +
        part.slice(1)
    )
    .join(' ');
}

// 🔥 COMPATIBILIDAD
export async function getLoggingStatus(client, guildId) {

  const config = await getGuildConfig(
    client.db,
    guildId
  );

  return {
    enabled:
      config.logging_enabled || false,

    channelId:
      config.log_channel || null,

    allEventTypes:
      EVENT_TYPES
  };
}

export {
  EVENT_TYPES,
  EVENT_COLORS,
  EVENT_ICONS
};