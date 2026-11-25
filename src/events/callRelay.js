import { Events } from 'discord.js';
import { logger } from '../utils/logger.js';

export default {
  name: Events.MessageCreate,
  async execute(message, client) {
    if (!message.guild || message.author.bot || !message.content && message.attachments.size === 0) return;
    const links = await client.db.get('berry:calls:' + message.guild.id, []);
    const matching = links.filter(link => link.ownerId === message.author.id && link.sourceChannelId === message.channel.id);
    for (const link of matching) {
      const channel = await message.guild.channels.fetch(link.destinationChannelId).catch(() => null);
      if (!channel?.isTextBased()) continue;
      const attachmentText = [...message.attachments.values()].map(file => file.url).join('\n');
      const body = [message.content, attachmentText].filter(Boolean).join('\n').slice(0, 1800);
      await channel.send({
        content: '<@' + link.targetId + '> ' + body,
        allowedMentions: { users: [link.targetId], parse: [] },
      }).catch(error => logger.warn('Message relay failed:', error.message));
    }
  }
};
