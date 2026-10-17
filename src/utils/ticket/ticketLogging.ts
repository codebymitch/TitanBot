// ticketLogging.js

import { ChannelType } from 'discord.js';
import type {
  Guild,
  GuildBasedChannel,
  GuildMember,
  GuildTextBasedChannel,
  MessageCreateOptions,
  PermissionsString,
} from 'discord.js';
import type { NexoClient } from '../../types/index.js';
import { getGuildConfig } from '../../services/config/guildConfig.js';
import { logger } from '../logger.js';
import {
  buildStandardLogEmbed,
  formatRatingStars,
  resolveUserAuthor,
} from '../logging/logEmbeds.js';
import type { LogAuthor, LogField } from '../logging/logEmbeds.js';

export interface TicketEventMetadata {
  rating?: number | null;
  comment?: string | null;
  messageCount?: number;
  duration?: string | number;
  subject?: string;
  [key: string]: unknown;
}

export interface TicketEvent {
  /** open | close | delete | claim | unclaim | priority | pin | unpin | transcript | feedback */
  type: string;
  ticketId?: string;
  ticketNumber?: string | number;
  userId?: string;
  executorId?: string;
  reason?: string | null;
  priority?: string;
  rating?: number | null;
  attachments?: MessageCreateOptions['files'];
  metadata?: TicketEventMetadata;
}

/** Guild config fields read for ticket logging. */
interface TicketLogConfig {
  ticketLogsChannelId?: string | null;
  ticketTranscriptChannelId?: string | null;
}

export interface TicketLoggingConfig {
  enabled: boolean;
  lifecycleChannelId: string | null;
  transcriptChannelId: string | null;
}

export async function logTicketEvent({ client, guildId, event }: {
  client: NexoClient;
  guildId: string;
  event: TicketEvent;
}): Promise<void> {
  try {
    const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) {
      logger.warn(`logTicketEvent invoked without valid guild: ${guildId}`);
      return;
    }

    const config = await getGuildConfig(client, guildId);

    const logChannelId = getLogChannelForEventType(config, event.type);
    if (!logChannelId) {
      return;
    }

    // Ticket log channels are text channels (as the JS assumed).
    const channel = (guild.channels.cache.get(logChannelId) || await guild.channels.fetch(logChannelId).catch(() => null)) as GuildTextBasedChannel | null;
    if (!channel) {
      logger.warn(`Ticket log channel not found: ${logChannelId} for event type: ${event.type}`);
      return;
    }

    const permissions = channel.permissionsFor(guild.members.me!);
    if (!permissions.has(['SendMessages', 'EmbedLinks'])) {
      logger.warn(`Missing permissions in ticket log channel: ${logChannelId}`);
      return;
    }

    const embed = await createTicketLogEmbed(guild, event);

    const messageOptions: MessageCreateOptions = { embeds: [embed] };

    if (event.attachments && event.attachments.length > 0) {
      messageOptions.files = event.attachments;
    }

    await channel.send(messageOptions);
    logger.info(`Ticket event logged: ${event.type} in guild ${guildId}`);
  } catch (error) {
    logger.error('Error logging ticket event:', error);
  }
}

export async function logTicketFeedback({
  client,
  guildId,
  ticketNumber,
  ticketChannelId,
  userId,
  rating = null,
  comment = null,
}: {
  client: NexoClient;
  guildId: string;
  ticketNumber?: string | number;
  ticketChannelId?: string;
  userId?: string;
  rating?: number | null;
  comment?: string | null;
}): Promise<void> {
  await logTicketEvent({
    client,
    guildId,
    event: {
      type: 'feedback',
      ticketId: ticketChannelId,
      ticketNumber,
      userId,
      metadata: {
        rating,
        comment,
      },
    },
  });
}

function getLogChannelForEventType(config: TicketLogConfig, eventType: string): string | null {
  switch (eventType) {
    case 'transcript':
      return config.ticketTranscriptChannelId || null;

    case 'open':
    case 'close':
    case 'delete':
    case 'claim':
    case 'unclaim':
    case 'priority':
    case 'pin':
    case 'unpin':
    case 'feedback':
      return config.ticketLogsChannelId || null;

    default:
      return null;
  }
}

const TICKET_EVENT_STYLES: Record<string, { color: number; title: string }> = {
  open: { color: 0x5865F2, title: 'Ticket erstellt' },
  close: { color: 0xED4245, title: 'Ticket geschlossen' },
  delete: { color: 0x8b0000, title: 'Ticket gelöscht' },
  claim: { color: 0x5865F2, title: 'Ticket übernommen' },
  unclaim: { color: 0xFAA61A, title: 'Ticket freigegeben' },
  priority: { color: 0x9b59b6, title: 'Priorität aktualisiert' },
  transcript: { color: 0x57F287, title: 'Transkript erstellt' },
  feedback: { color: 0x57F287, title: 'Feedback erhalten' },
};

async function createTicketLogEmbed(guild: Guild, event: TicketEvent) {
  const style = TICKET_EVENT_STYLES[event.type] || { color: 0x95a5a6, title: 'Ticket-Ereignis' };
  const ticketNumber = event.ticketNumber || event.ticketId;
  const ticketRef = ticketNumber ? `#${ticketNumber}` : 'Unbekannt';
  const channelMention = event.ticketId ? `<#${event.ticketId}>` : null;
  const executorMention = event.executorId ? `<@${event.executorId}>` : null;
  const userMention = event.userId ? `<@${event.userId}>` : null;

  let inlineFields: LogField[] = [];
  let fields: LogField[] = [];
  let author: LogAuthor | null = null;
  let footer = { text: 'Nexo Ticketing' };

  switch (event.type) {
    case 'open':
      author = await resolveUserAuthor(guild.client, event.userId);
      inlineFields = [
        { name: 'Ticket', value: ticketRef, inline: true },
        { name: 'Ersteller', value: userMention || 'Unbekannt', inline: true },
      ];
      if (channelMention) {
        inlineFields.push({ name: 'Kanal', value: channelMention, inline: true });
      }
      if (event.reason) {
        fields.push({ name: 'Grund', value: String(event.reason).slice(0, 1024), inline: false });
      }
      break;

    case 'close':
      author = await resolveUserAuthor(guild.client, event.executorId);
      inlineFields = [
        { name: 'Ticket', value: ticketRef, inline: true },
        { name: 'Geschlossen von', value: executorMention || 'Unbekannt', inline: true },
      ];
      if (channelMention) {
        inlineFields.push({ name: 'Kanal', value: channelMention, inline: true });
      }
      if (event.reason) {
        fields.push({ name: 'Grund', value: String(event.reason).slice(0, 1024), inline: false });
      }
      break;

    case 'delete':
      author = await resolveUserAuthor(guild.client, event.executorId);
      inlineFields = [
        { name: 'Ticket', value: ticketRef, inline: true },
        { name: 'Gelöscht von', value: executorMention || 'Unbekannt', inline: true },
      ];
      break;

    case 'claim':
    case 'unclaim':
      author = await resolveUserAuthor(guild.client, event.executorId);
      inlineFields = [
        { name: 'Ticket', value: ticketRef, inline: true },
        {
          name: event.type === 'claim' ? 'Übernommen von' : 'Freigegeben von',
          value: executorMention || 'Unbekannt',
          inline: true,
        },
      ];
      break;

    case 'priority': {
      const priorityEmojis: Record<string, string> = { none: '⚪', low: '🔵', medium: '🟢', high: '🟡', urgent: '🔴' };
      const priorityNames: Record<string, string> = { none: 'Keine', low: 'Niedrig', medium: 'Mittel', high: 'Hoch', urgent: 'Dringend' };
      const priorityLabel = event.priority
        ? `${priorityEmojis[event.priority] || '⚪'} ${priorityNames[event.priority] || event.priority}`
        : 'Unbekannt';
      author = await resolveUserAuthor(guild.client, event.executorId);
      inlineFields = [
        { name: 'Ticket', value: ticketRef, inline: true },
        { name: 'Priorität', value: priorityLabel, inline: true },
        { name: 'Aktualisiert von', value: executorMention || 'Unbekannt', inline: true },
      ];
      break;
    }

    case 'transcript':
      inlineFields = [
        { name: 'Ticket', value: ticketRef, inline: true },
        { name: 'Ersteller', value: userMention || 'Unbekannt', inline: true },
      ];
      if (event.metadata?.messageCount) {
        inlineFields.push({ name: 'Nachrichten', value: String(event.metadata.messageCount), inline: true });
      }
      if (event.metadata?.duration) {
        fields.push({ name: 'Dauer', value: String(event.metadata.duration), inline: false });
      }
      if (event.metadata?.subject || event.reason) {
        fields.push({
          name: 'Betreff',
          value: String(event.metadata?.subject || event.reason).slice(0, 1024),
          inline: false,
        });
      }
      break;

    case 'feedback': {
      const rating = event.metadata?.rating ?? event.rating;
      const comment = event.metadata?.comment;
      const ratingDisplay = formatRatingStars(rating) || 'Keine Bewertung';

      author = await resolveUserAuthor(guild.client, event.userId);
      inlineFields = [
        { name: 'Ticket', value: ticketRef, inline: true },
        { name: 'Bewertung', value: ratingDisplay, inline: true },
      ];

      if (comment) {
        fields.push({
          name: 'Kommentar',
          value: String(comment).slice(0, 1024),
          inline: false,
        });
      }
      break;
    }

    default:
      inlineFields = [
        { name: 'Ticket', value: ticketRef, inline: true },
      ];
      if (event.reason) {
        fields.push({ name: 'Details', value: String(event.reason).slice(0, 1024), inline: false });
      }
  }

  const titlePrefix = event.type === 'feedback' ? '⭐ ' : '';
  return buildStandardLogEmbed({
    color: style.color,
    title: `${titlePrefix}${style.title}`,
    inlineFields,
    fields,
    author,
    footer,
  });
}

export async function getTicketLoggingConfig(client: NexoClient, guildId: string): Promise<TicketLoggingConfig> {
  const config: TicketLogConfig = await getGuildConfig(client, guildId);
  return {
    enabled: !!(config.ticketLogsChannelId || config.ticketTranscriptChannelId),
    lifecycleChannelId: config.ticketLogsChannelId || null,
    transcriptChannelId: config.ticketTranscriptChannelId || null,
  };
}

export function validateLogChannel(
  channel: GuildBasedChannel | null | undefined,
  botMember: GuildMember
): { valid: boolean; error?: string } {
  if (!channel || channel.type !== ChannelType.GuildText) {
    return {
      valid: false,
      error: 'Der Kanal muss ein Textkanal sein.',
    };
  }

  const permissions = channel.permissionsFor(botMember);
  const requiredPermissions: PermissionsString[] = ['SendMessages', 'EmbedLinks'];

  const missing = requiredPermissions.filter((perm) => !permissions.has(perm));

  if (missing.length > 0) {
    return {
      valid: false,
      error: `Fehlende Berechtigungen: ${missing.join(', ')}`,
    };
  }

  return { valid: true };
}

