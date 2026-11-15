import { logger } from '../utils/logger.js';
import { getFromDb, setInDb, deleteFromDb } from '../utils/database.js';

const STICKY_PREFIX = 'stickyMessages';
const REPOST_DELAY_MS = 3000;

const pendingReposts = new Map();

function getStickyKey(guildId, channelId) {
  return `${STICKY_PREFIX}:${guildId}:${channelId}`;
}

function getIndexKey(guildId) {
  return `${STICKY_PREFIX}:${guildId}:index`;
}

function normalizeSticky(data) {
  if (!data || typeof data !== 'object') {
    return null;
  }

  return {
    channelId: data.channelId,
    content: typeof data.content === 'string' ? data.content : '',
    enabled: data.enabled !== false,
    lastMessageId: data.lastMessageId || null,
    updatedAt: data.updatedAt || null,
  };
}

export async function getSticky(_client, guildId, channelId) {
  return normalizeSticky(await getFromDb(getStickyKey(guildId, channelId), null));
}

export async function getGuildStickies(_client, guildId) {
  const index = await getFromDb(getIndexKey(guildId), []);
  const channelIds = Array.isArray(index) ? index : [];

  const stickies = [];
  for (const channelId of channelIds) {
    const sticky = await getSticky(_client, guildId, channelId);
    if (sticky) {
      stickies.push(sticky);
    }
  }

  return stickies;
}

async function addToIndex(guildId, channelId) {
  const index = await getFromDb(getIndexKey(guildId), []);
  const channelIds = Array.isArray(index) ? index : [];

  if (!channelIds.includes(channelId)) {
    channelIds.push(channelId);
    await setInDb(getIndexKey(guildId), channelIds);
  }
}

async function removeFromIndex(guildId, channelId) {
  const index = await getFromDb(getIndexKey(guildId), []);
  const channelIds = Array.isArray(index) ? index : [];
  await setInDb(
    getIndexKey(guildId),
    channelIds.filter((id) => id !== channelId),
  );
}

export async function saveSticky(guildId, channelId, data) {
  const record = {
    channelId,
    content: data.content || '',
    enabled: data.enabled !== false,
    lastMessageId: data.lastMessageId || null,
    updatedAt: new Date().toISOString(),
  };

  await setInDb(getStickyKey(guildId, channelId), record);
  await addToIndex(guildId, channelId);
  return record;
}

export async function removeSticky(guildId, channelId) {
  await deleteFromDb(getStickyKey(guildId, channelId));
  await removeFromIndex(guildId, channelId);
}

export async function deleteStickyMessage(channel, messageId) {
  if (!channel || !messageId) {
    return;
  }

  const target = await channel.messages.fetch(messageId).catch(() => null);
  if (target) {
    await target.delete().catch(() => {});
  }
}

export async function postSticky(guildId, channel, content, existing = null) {
  if (existing?.lastMessageId) {
    await deleteStickyMessage(channel, existing.lastMessageId);
  }

  const sent = await channel.send({ content });
  return saveSticky(guildId, channel.id, {
    content,
    enabled: true,
    lastMessageId: sent.id,
  });
}

function scheduleStickyRepost(client, message, guildId, channelId) {
  const existingTimer = pendingReposts.get(channelId);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }

  const timer = setTimeout(async () => {
    pendingReposts.delete(channelId);
    try {
      const sticky = await getSticky(client, guildId, channelId);
      if (!sticky?.enabled || !sticky.content) {
        return;
      }

      await deleteStickyMessage(message.channel, sticky.lastMessageId);
      const sent = await message.channel.send({ content: sticky.content });
      await saveSticky(guildId, channelId, {
        content: sticky.content,
        enabled: true,
        lastMessageId: sent.id,
      });
    } catch (error) {
      logger.error('Failed to repost sticky message:', error);
    }
  }, REPOST_DELAY_MS);

  if (typeof timer.unref === 'function') {
    timer.unref();
  }

  pendingReposts.set(channelId, timer);
}

export async function handleStickyMessage(message, client) {
  const sticky = await getSticky(client, message.guild.id, message.channel.id);
  if (!sticky?.enabled || !sticky.content) {
    return;
  }

  scheduleStickyRepost(client, message, message.guild.id, message.channel.id);
}
