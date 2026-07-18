import { createEmbed } from '../utils/embeds.js';
import logger from '../utils/logger.js';

export const STICKY_REFRESH_DELAY_MS = 3000;
const timers = new Map();
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
  const updated = { ...sticky, lastMessageId: message.id, lastPublishedAt: Date.now() };
  await saveStickyMessage(client, channel.guildId, channel.id, updated);
  return message;
}

export async function scheduleStickyRefresh(message) {
  const sticky = await getStickyMessage(message.client, message.guild.id, message.channel.id);
  if (!sticky?.content || !message.channel.isTextBased()) return false;

  const timerKey = `${message.guild.id}:${message.channel.id}`;
  clearTimeout(timers.get(timerKey));
  const timer = setTimeout(async () => {
    timers.delete(timerKey);
    try {
      const latest = await getStickyMessage(message.client, message.guild.id, message.channel.id);
      if (latest?.content) await publishStickyMessage(message.client, message.channel, latest);
    } catch (error) {
      logger.error('Failed to refresh sticky message', {
        guildId: message.guild.id,
        channelId: message.channel.id,
        error: error.stack || error.message,
      });
    }
  }, STICKY_REFRESH_DELAY_MS);
  timer.unref?.();
  timers.set(timerKey, timer);
  return true;
}
