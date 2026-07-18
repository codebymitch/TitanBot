import { createEmbed } from '../utils/embeds.js';
import logger from '../utils/logger.js';

export const STICKY_MESSAGE_INTERVAL = 5;
const stickyKey = (guildId, channelId) => `guild:${guildId}:sticky:${channelId}`;

export async function getStickyMessage(client, guildId, channelId) {
  return client.db.get(stickyKey(guildId, channelId), null);
}

export async function saveStickyMessage(client, guildId, channelId, sticky) {
  await client.db.set(stickyKey(guildId, channelId), sticky);
  return sticky;
}

export async function removeStickyMessage(client, guildId, channelId) {
  const sticky = await getStickyMessage(client, guildId, channelId);
  await client.db.delete(stickyKey(guildId, channelId));
  return sticky;
}

export async function publishStickyMessage(client, channel, sticky) {
  if (!sticky?.content || !channel?.isTextBased()) return null;

  if (sticky.lastMessageId) {
    const previous = await channel.messages.fetch(sticky.lastMessageId).catch(() => null);
    if (previous) await previous.delete().catch(error => logger.warn('Could not remove previous sticky message', {
      guildId: channel.guildId,
      channelId: channel.id,
      messageId: sticky.lastMessageId,
      error: error.message,
    }));
  }

  const message = await channel.send({
    embeds: [createEmbed({
      title: '📌 הודעה מוצמדת',
      description: sticky.content,
      color: 'primary',
    })],
    allowedMentions: { parse: [], users: [], roles: [] },
  });
  const updated = {
    ...sticky,
    lastMessageId: message.id,
    lastPublishedAt: Date.now(),
    messagesSinceLastPost: 0,
  };
  await saveStickyMessage(client, channel.guildId, channel.id, updated);
  return message;
}

export async function scheduleStickyRefresh(message) {
  const sticky = await getStickyMessage(message.client, message.guild.id, message.channel.id);
  if (!sticky?.content || !message.channel.isTextBased()) return false;

  const updated = {
    ...sticky,
    messagesSinceLastPost: (sticky.messagesSinceLastPost || 0) + 1,
  };
  if (updated.messagesSinceLastPost < STICKY_MESSAGE_INTERVAL) {
    await saveStickyMessage(message.client, message.guild.id, message.channel.id, updated);
    return false;
  }

  try {
    await publishStickyMessage(message.client, message.channel, updated);
    return true;
  } catch (error) {
    logger.error('Failed to refresh sticky message', {
      guildId: message.guild.id,
      channelId: message.channel.id,
      error: error.stack || error.message,
    });
    await saveStickyMessage(message.client, message.guild.id, message.channel.id, updated);
    return false;
  }
}
