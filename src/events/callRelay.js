import { createHash } from 'node:crypto';
import { ChannelType, Events } from 'discord.js';
import { logger } from '../utils/logger.js';

const seenMessageIds = new Map();
const seenPayloads = new Map();
const DUPLICATE_WINDOW_MS = 5000;
const MESSAGE_ID_TTL_MS = 10 * 60 * 1000;

function payloadFingerprint(message, body) {
  return createHash('sha256')
    .update([message.channel.id, message.author.id, body].join('\n'))
    .digest('hex');
}

export default {
  name: Events.MessageCreate,
  async execute(message, client) {
    const isBotOrWebhook = message.author.bot || Boolean(message.webhookId);
    if (!message.guild || !isBotOrWebhook || message.author.id === client.user?.id) return;

    const attachmentText = [...message.attachments.values()].map(file => file.url).join('\n');
    const embedText = message.embeds.map(embed => [embed.title, embed.description, embed.url].filter(Boolean).join('\n')).filter(Boolean).join('\n');
    const body = [message.content, embedText, attachmentText].filter(Boolean).join('\n').slice(0, 1700);
    if (!body) return;

    const now = Date.now();
    for (const [id, seenAt] of seenMessageIds) {
      if (now - seenAt > MESSAGE_ID_TTL_MS) seenMessageIds.delete(id);
    }
    for (const [signature, seenAt] of seenPayloads) {
      if (now - seenAt > DUPLICATE_WINDOW_MS) seenPayloads.delete(signature);
    }
    if (seenMessageIds.has(message.id)) return;

    const fingerprint = payloadFingerprint(message, body);
    if (seenPayloads.has(fingerprint)) return;

    // Share a short duplicate window through the database so separate bot workers
    // using the same database do not relay the same Tupperbox post twice.
    const dedupeKey = 'berry:call-relay-dedupe:' + message.guild.id;
    const saved = await client.db.get(dedupeKey, {});
    const recent = saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
    for (const [key, seenAt] of Object.entries(recent)) {
      if (now - Number(seenAt) > DUPLICATE_WINDOW_MS) delete recent[key];
    }
    if (Number(recent[fingerprint]) && now - Number(recent[fingerprint]) <= DUPLICATE_WINDOW_MS) return;
    recent[fingerprint] = now;
    recent[message.id] = now;
    await client.db.set(dedupeKey, recent).catch(() => {});

    seenMessageIds.set(message.id, now);
    seenPayloads.set(fingerprint, now);

    const links = await client.db.get('berry:calls:' + message.guild.id, []);
    const relaysByDestination = new Map();
    for (const link of Array.isArray(links) ? links : []) {
      const sourceMatches = link.sourceChannelId === message.channel.id
        || (message.channel.isThread?.() && link.sourceChannelId === message.channel.parentId);
      if (!sourceMatches || link.destinationChannelId === message.channel.id) continue;

      let relay = relaysByDestination.get(link.destinationChannelId);
      if (!relay) {
        relay = { targetIds: new Set() };
        relaysByDestination.set(link.destinationChannelId, relay);
      }
      if (link.targetId) relay.targetIds.add(link.targetId);
    }

    for (const [destinationId, relay] of relaysByDestination) {
      const channel = await message.guild.channels.fetch(destinationId).catch(() => null);
      if (!channel?.isTextBased() || channel.type === ChannelType.GuildForum) continue;
      const targetIds = [...relay.targetIds];
      const mentions = targetIds.map(id => '<@' + id + '>').join(' ');
      await channel.send({
        content: [mentions, body].filter(Boolean).join('\n').slice(0, 2000),
        allowedMentions: { users: targetIds, parse: [] },
      }).catch(error => logger.warn('Message relay failed:', error.message));
    }
  }
};
