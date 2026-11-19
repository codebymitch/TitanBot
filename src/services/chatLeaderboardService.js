import { AttachmentBuilder, EmbedBuilder } from 'discord.js';
import { logger } from '../utils/logger.js';
import { renderChatLeaderboardCard } from './chatLeaderboardCard.js';
import {
  getChatLeaderboardConfigKey,
  getChatLeaderboardUserKey,
  getChatLeaderboardUsersPrefix,
} from '../utils/database/keys.js';

const pendingCounts = new Map();
const enabledGuilds = new Set();
let flushPromise = null;

function pendingKey(guildId, userId) {
  return `${guildId}:${userId}`;
}

function defaultConfig() {
  return {
    leaderboard: {
      channelId: null,
      cardMessageId: null,
      listMessageId: null,
    },
  };
}

export async function getChatLeaderboardConfig(client, guildId) {
  if (!client?.db) return defaultConfig();
  const raw = await client.db.get(getChatLeaderboardConfigKey(guildId), {});
  return {
    leaderboard: {
      channelId: raw?.leaderboard?.channelId ? String(raw.leaderboard.channelId) : null,
      cardMessageId: raw?.leaderboard?.cardMessageId ? String(raw.leaderboard.cardMessageId) : null,
      listMessageId: raw?.leaderboard?.listMessageId ? String(raw.leaderboard.listMessageId) : null,
    },
  };
}

async function saveChatLeaderboardConfig(client, guildId, config) {
  return client.db.set(getChatLeaderboardConfigKey(guildId), {
    leaderboard: {
      channelId: config?.leaderboard?.channelId ? String(config.leaderboard.channelId) : null,
      cardMessageId: config?.leaderboard?.cardMessageId ? String(config.leaderboard.cardMessageId) : null,
      listMessageId: config?.leaderboard?.listMessageId ? String(config.leaderboard.listMessageId) : null,
    },
  });
}

export function trackChatMessage(message) {
  const guildId = message.guild?.id;
  const userId = message.author?.id;
  if (!guildId || !userId || message.author?.bot || message.webhookId || !enabledGuilds.has(guildId)) return;

  const key = pendingKey(guildId, userId);
  pendingCounts.set(key, (pendingCounts.get(key) || 0) + 1);
}

export async function flushChatMessageCounts(client) {
  if (flushPromise) return flushPromise;
  if (!client?.db || pendingCounts.size === 0) return;

  const batch = new Map(pendingCounts);
  pendingCounts.clear();
  flushPromise = (async () => {
    for (const [key, count] of batch) {
      const separator = key.indexOf(':');
      const guildId = key.slice(0, separator);
      const userId = key.slice(separator + 1);
      try {
        await client.db.increment(getChatLeaderboardUserKey(guildId, userId), count);
      } catch (error) {
        pendingCounts.set(key, (pendingCounts.get(key) || 0) + count);
        logger.error(`Failed to persist chat leaderboard count for ${guildId}:${userId}:`, error);
      }
    }
  })().finally(() => {
    flushPromise = null;
  });

  return flushPromise;
}

function formatCount(value) {
  return Math.max(0, Math.floor(Number(value) || 0)).toLocaleString('id-ID');
}

async function getChatLeaderboard(client, guild) {
  const prefix = getChatLeaderboardUsersPrefix(guild.id);
  const keys = await client.db.list(prefix);
  const totals = new Map();

  for (const key of keys) {
    const userId = key.slice(prefix.length);
    if (!userId) continue;
    const raw = await client.db.get(key, 0);
    const count = Math.max(0, Math.floor(Number(raw) || 0));
    if (count > 0) totals.set(userId, count);
  }

  for (const [key, pending] of pendingCounts) {
    const separator = key.indexOf(':');
    const guildId = key.slice(0, separator);
    const userId = key.slice(separator + 1);
    if (guildId !== guild.id || !userId) continue;
    totals.set(userId, (totals.get(userId) || 0) + pending);
  }

  const sorted = [...totals.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

  const resolved = await Promise.all(sorted.map(async ([userId, totalMessages]) => {
    const member = guild.members.cache.get(userId)
      || await guild.members.fetch(userId).catch(() => null);
    if (!member || member.user.bot) return null;
    return {
      userId,
      totalMessages,
      member,
      displayName: member.displayName || member.user.globalName || member.user.username,
    };
  }));

  const valid = resolved.filter(Boolean);
  const topTen = valid.slice(0, 10);

  return {
    entries: topTen.map((entry, index) => ({ ...entry, rank: index + 1 })),
    participantCount: topTen.length,
    totalMessages: topTen.reduce((sum, entry) => sum + entry.totalMessages, 0),
  };
}

async function buildChatLeaderboardPayload(client, guild) {
  const { entries, participantCount, totalMessages } = await getChatLeaderboard(client, guild);
  const image = entries.length
    ? await renderChatLeaderboardCard({ entries: entries.slice(0, 3) })
    : null;
  const cardEmbed = new EmbedBuilder().setColor(0xA753D2);
  if (image) {
    cardEmbed.setImage('attachment://chat-leaderboard.png');
  } else {
    cardEmbed.setDescription('No messages recorded yet.');
  }

  const rankIcons = {
    1: '<a:575980goldmedal:1571420250849677422>',
    2: '<a:670322silvermedal:1571420294550393002>',
    3: '<a:720507bronzemedal:1571420330529132605>',
    4: '<a:goldenarrow:1571414745313976451>',
    5: '<a:brownarrow:1571414861869613076>',
  };
  const rankingLines = entries.flatMap((entry) => [
    `**${entry.rank}.** <@${entry.userId}>`,
    `${rankIcons[entry.rank] || '<a:whitearrow:1571414768722518027>'} **total ${formatCount(entry.totalMessages)} messages**`,
  ]);
  const listEmbed = new EmbedBuilder()
    .setColor(0xA753D2)
    .setTitle('<a:speechbubble:1571443989175996566> TOP ALL TIME CHAT')
    .setDescription([
      '═════════════════════',
      rankingLines.length ? rankingLines.join('\n') : 'No messages recorded yet.',
      '═════════════════════',
      `<:users:1571422486841528463> **${participantCount} participants** · <a:typing:1571436147610095646> **${formatCount(totalMessages)} total messages**`,
      '<a:repeat:1571423818335916102> Refresh every 5 minutes',
    ].join('\n'))
    .setTimestamp();

  return {
    card: {
      content: '',
      embeds: [cardEmbed],
      files: image ? [new AttachmentBuilder(image, { name: 'chat-leaderboard.png' })] : [],
      attachments: [],
    },
    list: {
      content: '',
      embeds: [listEmbed],
      allowedMentions: { parse: [] },
    },
  };
}

export async function configureChatLeaderboard(client, guild, channel = null) {
  const config = await getChatLeaderboardConfig(client, guild.id);
  const previous = config.leaderboard;
  const oldChannel = previous.channelId
    ? guild.channels.cache.get(previous.channelId)
      || await guild.channels.fetch(previous.channelId).catch(() => null)
    : null;
  const oldCard = previous.cardMessageId && oldChannel?.messages
    ? await oldChannel.messages.fetch(previous.cardMessageId).catch(() => null)
    : null;
  const oldList = previous.listMessageId && oldChannel?.messages
    ? await oldChannel.messages.fetch(previous.listMessageId).catch(() => null)
    : null;

  if (!channel) {
    enabledGuilds.delete(guild.id);
    await oldCard?.delete().catch(() => {});
    await oldList?.delete().catch(() => {});
    await saveChatLeaderboardConfig(client, guild.id, { leaderboard: {} });
    return { enabled: false };
  }

  if (!channel.isTextBased?.() || typeof channel.send !== 'function') {
    throw new Error('Leaderboard channel must be a text channel.');
  }

  enabledGuilds.add(guild.id);
  const payload = await buildChatLeaderboardPayload(client, guild);
  const reuseMessages = oldChannel?.id === channel.id;
  const card = reuseMessages && oldCard
    ? await oldCard.edit(payload.card)
    : await channel.send(payload.card);
  const list = reuseMessages && oldList
    ? await oldList.edit(payload.list)
    : await channel.send(payload.list);
  if (!reuseMessages) {
    await oldCard?.delete().catch(() => {});
    await oldList?.delete().catch(() => {});
  }

  await saveChatLeaderboardConfig(client, guild.id, {
    leaderboard: {
      channelId: channel.id,
      cardMessageId: card.id,
      listMessageId: list.id,
    },
  });
  return { enabled: true, channelId: channel.id };
}

export async function updateChatLeaderboards(client) {
  await flushChatMessageCounts(client);
  for (const guild of client.guilds.cache.values()) {
    try {
      const config = await getChatLeaderboardConfig(client, guild.id);
      const { channelId, cardMessageId, listMessageId } = config.leaderboard;
      if (!channelId || !cardMessageId) continue;

      const channel = guild.channels.cache.get(channelId)
        || await guild.channels.fetch(channelId).catch(() => null);
      if (!channel?.messages) continue;
      const cardMessage = await channel.messages.fetch(cardMessageId).catch(() => null);
      const listMessage = listMessageId
        ? await channel.messages.fetch(listMessageId).catch(() => null)
        : null;
      const payload = await buildChatLeaderboardPayload(client, guild);
      const updatedCard = cardMessage
        ? await cardMessage.edit(payload.card)
        : await channel.send(payload.card);
      const updatedList = listMessage
        ? await listMessage.edit(payload.list)
        : await channel.send(payload.list);

      if (!cardMessage || !listMessageId || !listMessage) {
        await saveChatLeaderboardConfig(client, guild.id, {
          leaderboard: {
            channelId,
            cardMessageId: updatedCard.id,
            listMessageId: updatedList.id,
          },
        });
      }
    } catch (error) {
      logger.warn(`Chat leaderboard update failed for guild ${guild.id}:`, error);
    }
  }
}

export async function initializeChatLeaderboards(client) {
  enabledGuilds.clear();
  for (const guild of client.guilds.cache.values()) {
    const config = await getChatLeaderboardConfig(client, guild.id);
    if (config.leaderboard.channelId) enabledGuilds.add(guild.id);
  }
}

export function startChatLeaderboardUpdater(client) {
  if (!client.chatLeaderboardUpdateTimer) {
    client.chatLeaderboardUpdateTimer = setInterval(() => {
      updateChatLeaderboards(client).catch((error) => {
        logger.error('Chat leaderboard update task failed:', error);
      });
    }, 5 * 60 * 1000);
  }
  if (!client.chatLeaderboardFlushTimer) {
    client.chatLeaderboardFlushTimer = setInterval(() => {
      flushChatMessageCounts(client).catch((error) => {
        logger.error('Chat leaderboard flush task failed:', error);
      });
    }, 30 * 1000);
  }
}

export async function stopChatLeaderboardUpdater(client) {
  if (client.chatLeaderboardUpdateTimer) {
    clearInterval(client.chatLeaderboardUpdateTimer);
    client.chatLeaderboardUpdateTimer = null;
  }
  if (client.chatLeaderboardFlushTimer) {
    clearInterval(client.chatLeaderboardFlushTimer);
    client.chatLeaderboardFlushTimer = null;
  }
  await flushChatMessageCounts(client);
}
