import { Events } from 'discord.js';
import { logEvent, EVENT_TYPES } from '../services/loggingService.js';
import { logger } from '../utils/logger.js';

export default {
  name: Events.MessageUpdate,
  once: false,

  async execute(oldMessage, newMessage) {
    try {
      if (!newMessage.guild || newMessage.author?.bot) return;

      // Only log if content actually changed
      if (oldMessage.content === newMessage.content) return;

      const fields = [];

      // Add message author info
      if (newMessage.author) {
        fields.push({
          name: '👤 Author',
          value: `${newMessage.author.tag} (${newMessage.author.id})`,
          inline: true
        });
      }

      // Add channel info
      fields.push({
        name: '💬 Channel',
        value: `${newMessage.channel.toString()} (${newMessage.channel.id})`,
        inline: true
      });

      // Add old content
      const oldContent = oldMessage.content || '*(empty message)*';
      const oldContentTruncated = oldContent.length > 512 
        ? oldContent.substring(0, 509) + '...' 
        : oldContent;
      fields.push({
        name: '📝 Old Content',
        value: oldContentTruncated,
        inline: false
      });

      // Add new content
      const newContent = newMessage.content || '*(empty message)*';
      const newContentTruncated = newContent.length > 512 
        ? newContent.substring(0, 509) + '...' 
        : newContent;
      fields.push({
        name: '📝 New Content',
        value: newContentTruncated,
        inline: false
      });

      // Add message ID
      fields.push({
        name: '🆔 Message ID',
        value: newMessage.id,
        inline: true
      });

      await logEvent({
        client: newMessage.client,
        guildId: newMessage.guild.id,
        eventType: EVENT_TYPES.MESSAGE_EDIT,
        data: {
          description: `A message was edited in ${newMessage.channel.toString()}`,
          userId: newMessage.author?.id,
          channelId: newMessage.channel.id,
          fields
        }
      });

    } catch (error) {
      logger.error('Error in messageUpdate event:', error);
    }
  }
};
