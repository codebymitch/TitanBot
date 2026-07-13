// ticketLogging.js

import { ChannelType } from 'discord.js';
import { getGuildConfig } from '../../services/config/guildConfig.js';
import { logger } from '../logger.js';
import {
  buildStandardLogEmbed,
  formatRatingStars,
  resolveUserAuthor,
} from '../logging/logEmbeds.js';

export async function logTicketEvent({ client, guildId, event }) {
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

    const channel = guild.channels.cache.get(logChannelId) || await guild.channels.fetch(logChannelId).catch(() => null);
    if (!channel) {
      logger.warn(`Ticket log channel not found: ${logChannelId} for event type: ${event.type}`);
      return;
    }

    const permissions = channel.permissionsFor(guild.members.me);
    if (!permissions.has(['SendMessages', 'EmbedLinks'])) {
      logger.warn(`Missing permissions in ticket log channel: ${logChannelId}`);
      return;
    }

    const embed = await createTicketLogEmbed(guild, event);

    const messageOptions = { embeds: [embed] };

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
}) {
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

function getLogChannelForEventType(config, eventType) {
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

const TICKET_EVENT_STYLES = {
  open: { color: 0x5865F2, title: 'Ticket Created' },
  close: { color: 0xED4245, title: 'Ticket Closed' },
  delete: { color: 0x8b0000, title: 'Ticket Deleted' },
  claim: { color: 0x5865F2, title: 'Ticket Claimed' },
  unclaim: { color: 0xFAA61A, title: 'Ticket Unclaimed' },
  priority: { color: 0x9b59b6, title: 'Priority Updated' },
  transcript: { color: 0x57F287, title: 'Transcript Generated' },
  feedback: { color: 0x57F287, title: 'Feedback Received' },
};

async function createTicketLogEmbed(guild, event) {
  const style = TICKET_EVENT_STYLES[event.type] || { color: 0x95a5a6, title: 'Ticket Event' };
  const ticketNumber = event.ticketNumber || event.ticketId;
  const ticketRef = ticketNumber ? `#${ticketNumber}` : 'Unknown';
  const channelMention = event.ticketId ? `<#${event.ticketId}>` : null;
  const executorMention = event.executorId ? `<@${event.executorId}>` : null;
  const userMention = event.userId ? `<@${event.userId}>` : null;

  let inlineFields = [];
  let fields = [];
  let author = null;
  let footer = { text: 'TitanBot Ticketing' };

  switch (event.type) {
    case 'open':
      author = await resolveUserAuthor(guild.client, event.userId);
      inlineFields = [
        { name: 'Ticket', value: ticketRef, inline: true },
        { name: 'Creator', value: userMention || 'Unknown', inline: true },
      ];
      if (channelMention) {
        inlineFields.push({ name: 'Channel', value: channelMention, inline: true });
      }
      if (event.reason) {
        fields.push({ name: 'Reason', value: String(event.reason).slice(0, 1024), inline: false });
      }
      break;

    case 'close':
      author = await resolveUserAuthor(guild.client, event.executorId);
      inlineFields = [
        { name: 'Ticket', value: ticketRef, inline: true },
        { name: 'Closed by', value: executorMention || 'Unknown', inline: true },
      ];
      if (channelMention) {
        inlineFields.push({ name: 'Channel', value: channelMention, inline: true });
      }
      if (event.reason) {
        fields.push({ name: 'Reason', value: String(event.reason).slice(0, 1024), inline: false });
      }
      break;

    case 'delete':
      author = await resolveUserAuthor(guild.client, event.executorId);
      inlineFields = [
        { name: 'Ticket', value: ticketRef, inline: true },
        { name: 'Deleted by', value: executorMention || 'Unknown', inline: true },
      ];
      break;

    case 'claim':
    case 'unclaim':
      author = await resolveUserAuthor(guild.client, event.executorId);
      inlineFields = [
        { name: 'Ticket', value: ticketRef, inline: true },
        {
          name: event.type === 'claim' ? 'Claimed by' : 'Unclaimed by',
          value: executorMention || 'Unknown',
          inline: true,
        },
      ];
      break;

    case 'priority': {
      const priorityEmojis = { none: '⚪', low: '🔵', medium: '🟢', high: '🟡', urgent: '🔴' };
      const priorityLabel = event.priority
        ? `${priorityEmojis[event.priority] || '⚪'} ${event.priority.charAt(0).toUpperCase()}${event.priority.slice(1)}`
        : 'Unknown';
      author = await resolveUserAuthor(guild.client, event.executorId);
      inlineFields = [
        { name: 'Ticket', value: ticketRef, inline: true },
        { name: 'Priority', value: priorityLabel, inline: true },
        { name: 'Updated by', value: executorMention || 'Unknown', inline: true },
      ];
      break;
    }

    case 'transcript':
      inlineFields = [
        { name: 'Ticket', value: ticketRef, inline: true },
        { name: 'Creator', value: userMention || 'Unknown', inline: true },
      ];
      if (event.metadata?.messageCount) {
        inlineFields.push({ name: 'Messages', value: String(event.metadata.messageCount), inline: true });
      }
      if (event.metadata?.duration) {
        fields.push({ name: 'Duration', value: String(event.metadata.duration), inline: false });
      }
      if (event.metadata?.subject || event.reason) {
        fields.push({
          name: 'Subject',
          value: String(event.metadata?.subject || event.reason).slice(0, 1024),
          inline: false,
        });
      }
      break;

    case 'feedback': {
      const rating = event.metadata?.rating ?? event.rating;
      const comment = event.metadata?.comment;
      const ratingDisplay = formatRatingStars(rating) || 'No rating';

      author = await resolveUserAuthor(guild.client, event.userId);
      inlineFields = [
        { name: 'Ticket', value: ticketRef, inline: true },
        { name: 'Rating', value: ratingDisplay, inline: true },
      ];

      if (comment) {
        fields.push({
          name: 'Comment',
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

export async function getTicketLoggingConfig(client, guildId) {
  const config = await getGuildConfig(client, guildId);
  return {
    enabled: !!(config.ticketLogsChannelId || config.ticketTranscriptChannelId),
    lifecycleChannelId: config.ticketLogsChannelId || null,
    transcriptChannelId: config.ticketTranscriptChannelId || null,
  };
}

export function validateLogChannel(channel, botMember) {
  if (!channel || channel.type !== ChannelType.GuildText) {
    return {
      valid: false,
      error: 'Channel must be a text channel.',
    };
  }

  const permissions = channel.permissionsFor(botMember);
  const requiredPermissions = ['SendMessages', 'EmbedLinks'];

  const missing = requiredPermissions.filter((perm) => !permissions.has(perm));

  if (missing.length > 0) {
    return {
      valid: false,
      error: `Missing permissions: ${missing.join(', ')}`,
    };
  }

  return { valid: true };
}

