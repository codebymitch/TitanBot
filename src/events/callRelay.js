import { ChannelType, Events } from 'discord.js';
import { logger } from '../utils/logger.js';

const seenMessages = new Map();
const SEEN_TTL_MS = 10 * 60 * 1000;

export default {
  name: Events.MessageCreate,
  async execute(message, client) {
    if (!message.guild || message.author.bot || !message.content && message.attachments.size === 0) return;

    const now = Date.now();
    for (const [id, seenAt] of seenMessages) {
      if (now - seenAt > SEEN_TTL_MS) seenMessages.delete(id);
    }
    if (seenMessages.has(message.id)) return;
    seenMessages.set(message.id, now);

    const links = await client.db.get('berry:calls:' + message.guild.id, []);
    const seenLinks = new Set();
    const matching = links.filter(link => {
      const sourceMatches = link.sourceChannelId === message.channel.id
        || (message.channel.isThread?.() && link.sourceChannelId === message.channel.parentId);
      const identity = link.ownerId + ':' + link.sourceChannelId + ':' + link.destinationChannelId + ':' + link.targetId;
      if (link.ownerId !== message.author.id || !sourceMatches || seenLinks.has(identity)) return false;
      seenLinks.add(identity);
      return link.destinationChannelId !== message.channel.id;
    });

    for (const link of matching) {
      const channel = await message.guild.channels.fetch(link.destinationChannelId).catch(() => null);
      if (!channel?.isTextBased() || channel.type === ChannelType.GuildForum) continue;
      const attachmentText = [...message.attachments.values()].map(file => file.url).join('\n');
      const body = [message.content, attachmentText].filter(Boolean).join('\n').slice(0, 1800);
      await channel.send({
        content: '<@' + link.targetId + '> ' + body,
        allowedMentions: { users: [link.targetId], parse: [] },
      }).catch(error => logger.warn('Message relay failed:', error.message));
    }
  }
};
