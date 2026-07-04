import { Events } from 'discord.js';
import { logEvent, EVENT_TYPES } from '../services/loggingService.js';
import { logger } from '../utils/logger.js';
import { formatLogLine } from '../utils/logEmbeds.js';

const MAX_LOGGED_EDIT_CONTENT_LENGTH = 512;

export default {
  name: Events.MessageUpdate,
  once: false,

  async execute(oldMessage, newMessage) {
    try {
      if (!newMessage.guild || newMessage.author?.bot) return;

      if (oldMessage.content === newMessage.content) return;

      const metaLines = [
        formatLogLine('Channel', newMessage.channel ? `${newMessage.channel.name} ${newMessage.channel.toString()}` : 'Unknown'),
        formatLogLine('Message ID', `\`${newMessage.id}\``),
        formatLogLine('Message author', newMessage.author ? newMessage.author.toString() : 'Unknown'),
        formatLogLine('Message created', `<t:${Math.floor(newMessage.createdTimestamp / 1000)}:R>`),
      ];

      const oldContent = oldMessage.content || '*(empty message)*';
      const newContent = newMessage.content || '*(empty message)*';
      const oldContentTruncated = oldContent.length > MAX_LOGGED_EDIT_CONTENT_LENGTH
        ? `${oldContent.substring(0, MAX_LOGGED_EDIT_CONTENT_LENGTH - 3)}...`
        : oldContent;
      const newContentTruncated = newContent.length > MAX_LOGGED_EDIT_CONTENT_LENGTH
        ? `${newContent.substring(0, MAX_LOGGED_EDIT_CONTENT_LENGTH - 3)}...`
        : newContent;

      await logEvent({
        client: newMessage.client,
        guildId: newMessage.guild.id,
        eventType: EVENT_TYPES.MESSAGE_EDIT,
        data: {
          title: 'Message edited',
          lines: metaLines,
          quoted: true,
          fields: [
            { name: 'Before', value: oldContentTruncated, inline: true },
            { name: 'After', value: newContentTruncated, inline: true },
          ],
          userId: newMessage.author?.id,
          channelId: newMessage.channel.id,
        }
      });

    } catch (error) {
      logger.error('Error in messageUpdate event:', error);
    }
  }
};
