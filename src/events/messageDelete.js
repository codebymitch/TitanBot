import { Events } from 'discord.js';
import { logEvent, EVENT_TYPES } from '../services/loggingService.js';
import { logger } from '../utils/logger.js';

export default {
  name: Events.MessageDelete,
  once: false,

  async execute(message) {
    try {
      if (!message.guild || message.author?.bot) return;

      const fields = [];

      // Add message author info
      if (message.author) {
        fields.push({
          name: '👤 Author',
          value: `${message.author.tag} (${message.author.id})`,
          inline: true
        });
      }

      // Add channel info
      fields.push({
        name: '💬 Channel',
        value: `${message.channel.toString()} (${message.channel.id})`,
        inline: true
      });

      // Add message content (truncated if too long)
      if (message.content) {
        const content = message.content.length > 1024 
          ? message.content.substring(0, 1021) + '...' 
          : message.content;
        fields.push({
          name: '📝 Content',
          value: content || '*(empty message)*',
          inline: false
        });
      }

      // Add message ID
      fields.push({
        name: '🆔 Message ID',
        value: message.id,
        inline: true
      });

      // Add creation date
      fields.push({
        name: '📅 Created',
        value: `<t:${Math.floor(message.createdTimestamp / 1000)}:R>`,
        inline: true
      });

      // Add attachment count if any
      if (message.attachments.size > 0) {
        fields.push({
          name: '📎 Attachments',
          value: message.attachments.size.toString(),
          inline: true
        });
      }

      await logEvent({
        client: message.client,
        guildId: message.guild.id,
        eventType: EVENT_TYPES.MESSAGE_DELETE,
        data: {
          description: `A message was deleted in ${message.channel.toString()}`,
          userId: message.author?.id,
          channelId: message.channel.id,
          fields
        }
      });

    } catch (error) {
      logger.error('Error in messageDelete event:', error);
    }
  }
};
