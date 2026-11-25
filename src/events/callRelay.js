import { createHash } from 'node:crypto';
import { ChannelType, Events } from 'discord.js';
import { logger } from '../utils/logger.js';

const seenMessageIds = new Map();
const seenPayloads = new Map();
const DUPLICATE_WINDOW_MS = 5000;
const MESSAGE_ID_TTL_MS = 10 * 60 * 1000;

function payloadFingerprint(message, characterName, body) {
  return createHash('sha256')
    .update([message.guild.id, message.channel.id, characterName.toLowerCase(), body.trim().replace(/\s+/g, ' ')].join('\n'))
    .digest('hex');
}

export default {
  name: Events.MessageCreate,
  async execute(message, client) {
    const isBotOrWebhook = message.author.bot || Boolean(message.webhookId);
    if (!message.guild || !isBotOrWebhook || message.author.id === client.user?.id) return;

    const characterName = String(message.author.username || '').trim() || 'Bot';
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

    const fingerprint = payloadFingerprint(message, characterName, body);
    if (seenPayloads.has(fingerprint)) return;

    // Atomically claim this payload in PostgreSQL so duplicate bot workers
    // cannot each send a copy of the same character post.
    const claimKey = 'cache:callrelay:' + message.guild.id + ':' + fingerprint;
    const claimed = await client.db.setIfAbsent?.(claimKey, true, Math.ceil(DUPLICATE_WINDOW_MS / 1000));
    // If the shared claim store is unavailable, skip this relay rather than
    // letting multiple bot workers each send the same character message.
    if (claimed !== true) {
      if (claimed == null) logger.warn('Call relay skipped because duplicate protection is unavailable.');
      return;
    }

    seenMessageIds.set(message.id, now);
    seenPayloads.set(fingerprint, now);

    const links = await client.db.get('berry:calls:' + message.guild.id, []);
    const destinations = new Set();
    for (const link of Array.isArray(links) ? links : []) {
      const sourceMatches = link.sourceChannelId === message.channel.id
        || (message.channel.isThread?.() && link.sourceChannelId === message.channel.parentId);
      if (!sourceMatches || !link.destinationChannelId || link.destinationChannelId === message.channel.id) continue;
      destinations.add(link.destinationChannelId);
    }

    const content = (characterName + ': ' + body).slice(0, 2000);
    for (const destinationId of destinations) {
      const channel = await message.guild.channels.fetch(destinationId).catch(() => null);
      if (!channel?.isTextBased() || channel.type === ChannelType.GuildForum) continue;
      await channel.send({
        content,
        allowedMentions: { parse: [] },
      }).catch(error => logger.warn('Message relay failed:', error.message));
    }
  }
};
