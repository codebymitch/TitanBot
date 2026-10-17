// loggingService.js

import { ChannelType } from 'discord.js';
import type { ColorResolvable, Guild, Message, MessageCreateOptions } from 'discord.js';
import type { GuildConfig, NexoClient } from '../types/index.js';
import { getGuildConfig, updateGuildConfig } from './config/guildConfig.js';
import { logger } from '../utils/logger.js';
import {
  appendContentSection,
  buildLogDescription,
  buildStandardLogEmbed,
  fieldsToLines,
  splitComparisonFields,
} from '../utils/logging/logEmbeds.js';
import type { LogField, LogMetaEntry, StandardLogEmbedOptions } from '../utils/logging/logEmbeds.js';

/** Payload for logEvent; extra keys are allowed and ignored by the embed builder. */
export interface LogEventData {
  userId?: string;
  channelId?: string;
  color?: ColorResolvable | null;
  title?: string | null;
  description?: string | null;
  headline?: string | null;
  lines?: string[];
  quoted?: boolean;
  meta?: LogMetaEntry[];
  fields?: LogField[];
  section?: { title?: string | null; body?: string | null } | null;
  inlineFields?: LogField[];
  blockFields?: LogField[];
  thumbnail?: string | null;
  author?: StandardLogEmbedOptions['author'];
  footer?: StandardLogEmbedOptions['footer'];
  [key: string]: unknown;
}

export interface LogEventOptions {
  client: NexoClient;
  guildId: string;
  eventType: string;
  data?: LogEventData;
  attachments?: NonNullable<MessageCreateOptions['files']>;
  content?: string | null;
  channelId?: string | null;
}

interface ApplicationLogSettings {
  logChannelId?: string | null;
}

type LoggingSettings = NonNullable<GuildConfig['logging']>;

const LOG_DESTINATIONS: string[] = ['audit', 'applications', 'reports'];

const EVENT_TYPES = {
  MODERATION_BAN: 'moderation.ban',
  MODERATION_KICK: 'moderation.kick',
  MODERATION_MUTE: 'moderation.mute',
  MODERATION_WARN: 'moderation.warn',
  MODERATION_PURGE: 'moderation.purge',
  MODERATION_TIMEOUT: 'moderation.timeout',
  MODERATION_UNTIMEOUT: 'moderation.untimeout',
  MODERATION_UNBAN: 'moderation.unban',
  MODERATION_LOCK: 'moderation.lock',
  MODERATION_UNLOCK: 'moderation.unlock',
  MODERATION_DM: 'moderation.dm',
  MODERATION_CONFIG: 'moderation.config',

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

  COUNTER_UPDATE: 'counter.update',
  COUNTER_CONFIG: 'counter.config',

  APPLICATION_SUBMIT: 'application.submit',
  APPLICATION_REVIEW: 'application.review',

  REPORT_FILE: 'report.file',
};

const EVENT_COLORS: Record<string, number> = {
  'moderation.ban': 0x721919,
  'moderation.kick': 0xFFA500,
  'moderation.mute': 0xF1C40F,
  'moderation.warn': 0xFEE75C,
  'moderation.purge': 0xE67E22,
  'moderation.timeout': 0xF1C40F,
  'moderation.untimeout': 0x2ecc71,
  'moderation.unban': 0x3498db,
  'moderation.lock': 0xE67E22,
  'moderation.unlock': 0x2ecc71,
  'moderation.dm': 0x3498db,
  'moderation.config': 0x5865F2,
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
  'counter.config': 0x5865F2,
  'application.submit': 0x5865F2,
  'application.review': 0x57F287,
  'report.file': 0xED4245,
};

const EVENT_ICONS: Record<string, string> = {
  'moderation.ban': '🔨',
  'moderation.kick': '👢',
  'moderation.mute': '🔇',
  'moderation.warn': '⚠️',
  'moderation.purge': '🗑️',
  'moderation.timeout': '⏳',
  'moderation.untimeout': '✅',
  'moderation.unban': '🔓',
  'moderation.lock': '🔒',
  'moderation.unlock': '🔓',
  'moderation.dm': '✉️',
  'moderation.config': '⚙️',
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
  'counter.config': '⚙️',
  'application.submit': '📝',
  'application.review': '📋',
  'report.file': '🚨',
};

/** German display titles for log embeds that do not pass their own title. */
const EVENT_TITLES: Record<string, string> = {
  'moderation.ban': 'Mitglied gebannt',
  'moderation.kick': 'Mitglied gekickt',
  'moderation.mute': 'Mitglied stummgeschaltet',
  'moderation.warn': 'Mitglied verwarnt',
  'moderation.purge': 'Nachrichten gelöscht',
  'moderation.timeout': 'Timeout',
  'moderation.untimeout': 'Timeout aufgehoben',
  'moderation.unban': 'Bann aufgehoben',
  'moderation.lock': 'Kanal gesperrt',
  'moderation.unlock': 'Kanal entsperrt',
  'moderation.dm': 'Moderations-DM',
  'moderation.config': 'Moderations-Einstellungen',
  'leveling.levelup': 'Level-Up',
  'leveling.milestone': 'Level-Meilenstein',
  'message.delete': 'Nachricht gelöscht',
  'message.edit': 'Nachricht bearbeitet',
  'message.bulkdelete': 'Nachrichten gesammelt gelöscht',
  'role.create': 'Rolle erstellt',
  'role.delete': 'Rolle gelöscht',
  'role.update': 'Rolle aktualisiert',
  'member.join': 'Mitglied beigetreten',
  'member.leave': 'Mitglied hat den Server verlassen',
  'member.namechange': 'Name geändert',
  'reactionrole.add': 'Reaktionsrolle vergeben',
  'reactionrole.remove': 'Reaktionsrolle entfernt',
  'reactionrole.create': 'Reaktionsrollen-Panel erstellt',
  'reactionrole.delete': 'Reaktionsrollen-Panel gelöscht',
  'reactionrole.update': 'Reaktionsrollen-Panel aktualisiert',
  'giveaway.create': 'Giveaway erstellt',
  'giveaway.winner': 'Giveaway-Gewinner',
  'giveaway.reroll': 'Giveaway neu ausgelost',
  'giveaway.delete': 'Giveaway gelöscht',
  'counter.update': 'Zähler aktualisiert',
  'counter.config': 'Zähler-Einstellungen',
  'application.submit': 'Bewerbung eingereicht',
  'application.review': 'Bewerbung geprüft',
  'report.file': 'Meldung eingereicht',
};

const CATEGORY_DESTINATION: Record<string, string> = {
  application: 'applications',
  report: 'reports',
};

export function resolveLogChannel(config: GuildConfig | null | undefined, destination: string): string | null {
  const channels: Record<string, string | null | undefined> = config?.logging?.channels || {};
  if (destination && channels[destination]) {
    return channels[destination];
  }
  if (destination === 'audit') {
    return channels.audit ?? config?.logging?.channelId ?? config?.logChannelId ?? null;
  }
  return channels[destination] ?? null;
}

export function getIgnoreList(config: GuildConfig | null | undefined): { users: string[]; channels: string[] } {
  return config?.logging?.ignore ?? config?.logIgnore ?? { users: [], channels: [] };
}

export function isEventEnabled(config: GuildConfig | null | undefined, eventType: string | null | undefined): boolean {
  if (!config?.logging?.enabled) {
    return false;
  }

  if (!eventType || typeof eventType !== 'string') {
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

function getLogChannelForEvent(config: GuildConfig | null | undefined, eventType: string, overrideChannelId: string | null = null): string | null {
  if (overrideChannelId) {
    return overrideChannelId;
  }

  const category = eventType?.split('.')[0];
  const destination = CATEGORY_DESTINATION[category] || 'audit';
  return resolveLogChannel(config, destination);
}

export async function logEvent({
  client,
  guildId,
  eventType,
  data = {},
  attachments = [],
  content = null,
  channelId: overrideChannelId = null,
}: LogEventOptions): Promise<Message<true> | null> {
  try {
    const guild = client.guilds.cache.get(guildId) ||
      await client.guilds.fetch(guildId).catch(() => null);

    if (!guild) {
      logger.warn(`logEvent: Guild not found: ${guildId}`);
      return null;
    }

    const config = await getGuildConfig(client, guildId);
    const ignore = getIgnoreList(config);

    if (data?.userId && ignore.users?.includes(data.userId)) {
      return null;
    }
    if (data?.channelId && ignore.channels?.includes(data.channelId)) {
      return null;
    }

    if (!isEventEnabled(config, eventType)) {
      return null;
    }

    const logChannelId = getLogChannelForEvent(config, eventType, overrideChannelId);
    if (!logChannelId) {
      return null;
    }

    const channel = guild.channels.cache.get(logChannelId) ||
      await guild.channels.fetch(logChannelId).catch(() => null);

    if (!channel || channel.type !== ChannelType.GuildText) {
      logger.warn(`logEvent: Invalid log channel ${logChannelId} for guild ${guildId}`);
      return null;
    }

    const permissions = channel.permissionsFor(guild.members.me!);
    if (!permissions || !permissions.has(['SendMessages', 'EmbedLinks'])) {
      logger.warn(`logEvent: Missing permissions in channel ${logChannelId}`);
      return null;
    }

    const embed = createLogEmbed(guild, eventType, data);

    const messageOptions: MessageCreateOptions = { embeds: [embed] };
    if (content) {
      messageOptions.content = content;
    }
    if (attachments.length > 0) {
      messageOptions.files = attachments;
    }

    const sent = await channel.send(messageOptions);
    logger.info(`Event logged: ${eventType} in guild ${guildId}`);
    return sent;
  } catch (error) {
    logger.error('Error in logEvent:', error);
    return null;
  }
}

function createLogEmbed(guild: Guild, eventType: string, data: LogEventData) {
  const color = data.color ?? EVENT_COLORS[eventType] ?? 0x0099ff;
  const icon = EVENT_ICONS[eventType] || '📌';
  const title = data.title || `${icon} ${EVENT_TITLES[eventType] ?? formatEventType(eventType)}`;

  const inlineFields: LogField[] = [];
  let description = data.description || '';

  if (data.lines?.length) {
    description = buildLogDescription({
      headline: data.headline || description || undefined,
      lines: data.lines,
      quoted: data.quoted !== false,
      meta: data.meta,
    });

    if (data.fields?.length) {
      const { before, after } = splitComparisonFields(data.fields);
      if (before !== null) inlineFields.push({ name: 'Vorher', value: before, inline: true });
      if (after !== null) inlineFields.push({ name: 'Nachher', value: after, inline: true });
    }
  } else if (data.fields?.length) {
    const { before, after, rest } = splitComparisonFields(data.fields);

    if (before !== null || after !== null) {
      const metaLines = fieldsToLines(rest);
      description = buildLogDescription({
        headline: description || undefined,
        lines: metaLines,
        quoted: true,
      });

      if (before !== null) {
        inlineFields.push({ name: 'Vorher', value: before, inline: true });
      }
      if (after !== null) {
        inlineFields.push({ name: 'Nachher', value: after, inline: true });
      }
    } else {
      description = buildLogDescription({
        headline: description || undefined,
        lines: fieldsToLines(data.fields),
        quoted: data.quoted ?? !description,
      });
    }
  } else if (data.meta?.length) {
    description = buildLogDescription({
      headline: description || undefined,
      meta: data.meta,
    });
  }

  if (data.section?.body) {
    description = appendContentSection(description, data.section.title || 'Nachricht', data.section.body);
  }

  if (data.inlineFields?.length) {
    inlineFields.push(...data.inlineFields);
  }

  return buildStandardLogEmbed({
    color,
    title,
    description: description || undefined,
    thumbnail: data.thumbnail || undefined,
    inlineFields,
    fields: data.blockFields || [],
    author: data.author || null,
    timestamp: true,
    footer: data.footer || { text: guild.name, iconURL: guild.iconURL() || undefined },
  });
}

function formatEventType(eventType: string): string {
  if (!eventType || typeof eventType !== 'string') {
    return 'Unbekanntes Ereignis';
  }

  return eventType
    .split('.')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export async function getLoggingStatus(client: NexoClient, guildId: string) {
  const config = await getGuildConfig(client, guildId);
  const logging: Partial<LoggingSettings> = config.logging || {};

  return {
    enabled: logging.enabled || false,
    channels: logging.channels || { audit: null, applications: null, reports: null },
    channelId: logging.channels?.audit ?? null,
    ignore: getIgnoreList(config),
    enabledEvents: logging.enabledEvents || {},
    allEventTypes: EVENT_TYPES,
  };
}

export async function toggleEventLogging(client: NexoClient, guildId: string, eventTypes: string | string[], enabled: boolean): Promise<boolean> {
  try {
    const config = await getGuildConfig(client, guildId);
    const logging = { ...config.logging, enabledEvents: { ...(config.logging?.enabledEvents || {}) } };
    const types = Array.isArray(eventTypes) ? eventTypes : [eventTypes];

    types.forEach((type) => {
      if (type.endsWith('.*')) {
        const category = type.replace('.*', '');
        const matchingTypes = Object.values(EVENT_TYPES).filter(
          (eventType) => eventType.startsWith(`${category}.`),
        );
        matchingTypes.forEach((eventType) => {
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

export async function setLogChannel(client: NexoClient, guildId: string, destination: string, channelId: string | null): Promise<boolean> {
  if (!LOG_DESTINATIONS.includes(destination)) {
    throw new Error(`Invalid log destination: ${destination}`);
  }

  try {
    const config = await getGuildConfig(client, guildId);
    const logging = {
      ...config.logging,
      channels: { ...(config.logging?.channels || {}), [destination]: channelId },
    };

    if (channelId) {
      logging.enabled = true;
    }

    await updateGuildConfig(client, guildId, { logging });
    return true;
  } catch (error) {
    logger.error('Error setting log channel:', error);
    return false;
  }
}

/** @deprecated Use setLogChannel(client, guildId, 'audit', channelId) */
export async function setLoggingChannel(client: NexoClient, guildId: string, channelId: string | null): Promise<boolean> {
  return setLogChannel(client, guildId, 'audit', channelId);
}

export async function setLoggingEnabled(client: NexoClient, guildId: string, enabled: boolean): Promise<boolean> {
  try {
    const config = await getGuildConfig(client, guildId);
    const logging = { ...config.logging, enabled };
    await updateGuildConfig(client, guildId, { logging });
    return true;
  } catch (error) {
    logger.error('Error setting logging enabled:', error);
    return false;
  }
}

export async function updateIgnoreList(
  client: NexoClient,
  guildId: string,
  { action, type, id }: { action: string; type: string; id: string },
): Promise<boolean> {
  try {
    const config = await getGuildConfig(client, guildId);
    const ignore = { ...getIgnoreList(config) };
    const listKey = type === 'user' ? 'users' : 'channels';
    const current = [...(ignore[listKey] || [])];

    if (action === 'add' && !current.includes(id)) {
      current.push(id);
    } else if (action === 'remove') {
      const index = current.indexOf(id);
      if (index !== -1) {
        current.splice(index, 1);
      }
    }

    ignore[listKey] = current;

    const logging = { ...config.logging, ignore };
    await updateGuildConfig(client, guildId, { logging });
    return true;
  } catch (error) {
    logger.error('Error updating ignore list:', error);
    return false;
  }
}

export function resolveApplicationLogChannel(
  config: GuildConfig | null | undefined,
  roleSettings: ApplicationLogSettings = {},
  appSettings: ApplicationLogSettings = {},
): string | null {
  return roleSettings.logChannelId
    || config?.logging?.channels?.applications
    || appSettings.logChannelId
    || null;
}

export { EVENT_TYPES, EVENT_COLORS, EVENT_ICONS, LOG_DESTINATIONS };
