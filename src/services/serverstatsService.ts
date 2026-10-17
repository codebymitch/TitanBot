// serverstatsService.js

import { logger } from '../utils/logger.js';
import { logEvent, EVENT_TYPES } from './loggingService.js';
import { formatLogLine } from '../utils/logging/logEmbeds.js';
import { getServerCountersKey } from '../utils/database/keys.js';
import botConfig from '../config/bot.js';
import type { Guild, GuildBasedChannel } from 'discord.js';
import type { NexoClient } from '../types/index.js';

export interface CounterTypeConfig {
  label: string;
  baseName: string;
  emoji: string;
}

/** Stored server counter (`guild:{guildId}:...` counters key). */
export interface ServerCounter {
  id: string;
  type: string;
  channelId: string;
  guildId: string;
  createdAt: string;
  enabled: boolean;
  updatedAt?: string;
}

/** A counter as passed in or read back before normalization. */
export interface ServerCounterInput {
  id: string;
  type: string;
  channelId: string;
  guildId?: string;
  createdAt?: string;
  enabled?: boolean;
  updatedAt?: string;
}

export const COUNTER_TYPE_CONFIG: Record<string, CounterTypeConfig> = {
  members: {
    label: 'Mitglieder + Bots',
    baseName: 'Mitglieder & Bots',
    emoji: '👥'
  },
  members_only: {
    label: 'Nur Mitglieder',
    baseName: 'Mitglieder',
    emoji: '👤'
  },
  bots: {
    label: 'Nur Bots',
    baseName: 'Bots',
    emoji: '🤖'
  }
};

function getCounterConfig(type: string): CounterTypeConfig {
  return COUNTER_TYPE_CONFIG[type] || {
    label: 'Unbekannt',
    baseName: 'Zähler',
    emoji: '❓'
  };
}

export function getCounterTypeLabel(type: string): string {
  return getCounterConfig(type).label;
}

export function getCounterBaseName(type: string): string {
  return getCounterConfig(type).baseName;
}

export function getCounterEmoji(type: string): string {
  return getCounterConfig(type).emoji;
}

export function formatCounterChannelName(type: string, count: number | string): string {
  const template = botConfig.counters?.defaults?.channelName || '{name}-{count}';
  const baseName = getCounterBaseName(type);
  return template
    .replaceAll('{name}', baseName)
    .replaceAll('{count}', String(count));
}

export function getCounterActionMessage(action: string, values: Record<string, unknown> = {}): string | null {
  const messages: Record<string, string | undefined> | undefined = botConfig.counters?.messages;
  const template = messages?.[action];
  if (!template) {
    return null;
  }

  return Object.entries(values).reduce(
    (message, [key, value]) => message.replaceAll(`{${key}}`, String(value)),
    template,
  );
}

export async function getGuildCounterStats(guild: Guild): Promise<{ totalCount: number; botCount: number; humanCount: number }> {
  let memberCollection = guild.members.cache;

  try {
    memberCollection = await guild.members.fetch();
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      logger.debug(`Failed to fetch all guild members for ${guild.id}, using cache only`, error);
    }
  }

  const botCount = memberCollection.filter((member) => member.user.bot).size;
  const totalCount = typeof guild.memberCount === 'number' ? guild.memberCount : memberCollection.size;
  const humanCount = Math.max(totalCount - botCount, 0);

  return {
    totalCount,
    botCount,
    humanCount
  };
}

export async function getCounterCount(guild: Guild, type: string): Promise<number | null> {
  const stats = await getGuildCounterStats(guild);

  switch (type) {
    case 'members':
      return stats.totalCount;
    case 'bots':
      return stats.botCount;
    case 'members_only':
      return stats.humanCount;
    default:
      return null;
  }
}

function isValidCounterShape(value: unknown): value is ServerCounterInput {
  const counter = value as Partial<Record<keyof ServerCounterInput, unknown>> | null | undefined;
  return Boolean(
    counter &&
    typeof counter === 'object' &&
    typeof counter.id === 'string' &&
    counter.id.length > 0 &&
    typeof counter.type === 'string' &&
    typeof counter.channelId === 'string' &&
    counter.channelId.length > 0
  );
}

function normalizeCounter(counter: ServerCounterInput, guildId: string): ServerCounter {
  const normalized: ServerCounter = {
    id: String(counter.id),
    type: String(counter.type),
    channelId: String(counter.channelId),
    guildId: String(counter.guildId || guildId),
    createdAt: counter.createdAt || new Date().toISOString(),
    enabled: typeof counter.enabled === 'boolean' ? counter.enabled : true
  };

  if (counter.updatedAt) {
    normalized.updatedAt = counter.updatedAt;
  }

  return normalized;
}

function sanitizeCounters(counters: unknown, guildId: string): ServerCounter[] {
  if (!Array.isArray(counters)) {
    return [];
  }

  return counters
    .filter(isValidCounterShape)
    .map(counter => normalizeCounter(counter, guildId));
}

export async function updateCounter(client: NexoClient, guild: Guild, counter: ServerCounterInput | null | undefined): Promise<boolean> {
  try {
    if (!counter || !counter.type || !counter.channelId) {
      logger.warn('Skipping invalid counter in updateCounter:', counter);
      return false;
    }
    
    const { type, channelId } = counter;
    let channel: GuildBasedChannel | null | undefined = guild.channels.cache.get(channelId);
    if (!channel) {
      try {
        channel = await guild.channels.fetch(channelId);
      } catch {
        channel = null;
      }
    }
    if (!channel) {
      logger.warn(`Counter channel ${channelId} not found in guild ${guild.id}, skipping update`);
      return false;
    }

    const count = await getCounterCount(guild, type);
    if (count === null) {
      logger.error('Unknown counter type:', type);
      return false;
    }

    const baseName = getCounterBaseName(type);
    if (process.env.NODE_ENV !== 'production') {
      logger.debug(`Base name: "${baseName}", Current name: "${channel.name}"`);
    }
    
    const newName = formatCounterChannelName(type, count);
    if (process.env.NODE_ENV !== 'production') {
      logger.debug(`New name would be: "${newName}"`);
    }
    
    if (channel.name !== newName) {
      try {
        await channel.setName(newName);
        if (process.env.NODE_ENV !== 'production') {
          logger.debug(`Updated channel name to: "${newName}"`);
        }

        try {
          await logEvent({
            client,
            guildId: guild.id,
            eventType: EVENT_TYPES.COUNTER_UPDATE,
            data: {
              title: 'Zähler aktualisiert',
              lines: [
                formatLogLine('Typ', getCounterTypeLabel(type)),
                formatLogLine('Anzahl', count.toString()),
                formatLogLine('Kanal', channel.toString()),
              ],
              channelId: channel.id,
            },
          });
        } catch (error) {
          logger.debug('Error logging counter update:', error);
        }

      } catch (error) {
        logger.error(`Failed to update channel name for ${channel.id}:`, error);
        return false;
      }
    } else {
      if (process.env.NODE_ENV !== 'production') {
        logger.debug('Channel name already correct, no update needed');
      }
    }
    return true;
  } catch (error) {
    logger.error("Error updating counter:", error);
    return false;
  }
}

export async function getServerCounters(client: NexoClient, guildId: string): Promise<ServerCounter[]> {
  try {
    if (!client || !client.db) {
      logger.warn('Database not available for getServerCounters');
      return [];
    }
    
    const data = await client.db.get<{ ok?: unknown; value?: unknown }>(getServerCountersKey(guildId));
    
    let counters: unknown[] = [];
    
    if (data && typeof data === 'object' && data.ok && Array.isArray(data.value)) {
      counters = data.value;
    } else if (Array.isArray(data)) {
      counters = data;
    } else if (typeof data === 'string') {
      try {
        const parsed = JSON.parse(data);
        counters = Array.isArray(parsed) ? parsed : [];
      } catch {
        counters = [];
      }
    } else if (data && typeof data === 'object' && !data.ok && isValidCounterShape(data)) {
      counters = [data];
    } else {
      if (process.env.NODE_ENV !== 'production') {
        logger.debug('No counter data found, returning empty array');
      }
      return [];
    }

    return sanitizeCounters(counters, guildId);
  } catch (error) {
    logger.error("Error getting server counters:", error);
    return [];
  }
}

export async function saveServerCounters(client: NexoClient, guildId: string, counters: ServerCounterInput[]): Promise<boolean> {
  try {
    if (!client || !client.db) {
      logger.warn('Database not available for saveServerCounters');
      return false;
    }
    
    const sanitizedCounters = sanitizeCounters(counters, guildId);

    if (process.env.NODE_ENV !== 'production') {
      logger.debug(`Saving ${sanitizedCounters.length} counters for guild ${guildId}:`, sanitizedCounters);
    }

    await client.db.set(getServerCountersKey(guildId), sanitizedCounters);
    if (process.env.NODE_ENV !== 'production') {
      logger.debug('Counters saved successfully');
    }
    return true;
  } catch (error) {
    logger.error("Error saving server counters:", error);
    return false;
  }
}