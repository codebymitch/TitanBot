import { Events } from 'discord.js';
import type { GuildTextBasedChannel } from 'discord.js';
import { logEvent, EVENT_TYPES } from '../services/loggingService.js';
import { logger } from '../utils/logger.js';
import { formatLogLine } from '../utils/logging/logEmbeds.js';
import type { BotEvent } from '../types/index.js';

const MAX_LOGGED_EDIT_CONTENT_LENGTH = 512;

export default {
  name: Events.MessageUpdate,
  once: false,

  async execute(oldMessage, newMessage) {
    try {
      if (!newMessage.guild || newMessage.author?.bot) return;

      if (oldMessage.content === newMessage.content) return;

      const metaLines = [
        formatLogLine('Kanal', newMessage.channel ? `${(newMessage.channel as GuildTextBasedChannel).name} ${newMessage.channel.toString()}` : 'Unbekannt'),
        formatLogLine('Nachrichten-ID', `\`${newMessage.id}\``),
        formatLogLine('Autor', newMessage.author ? newMessage.author.toString() : 'Unbekannt'),
        formatLogLine('Erstellt', `<t:${Math.floor(newMessage.createdTimestamp / 1000)}:R>`),
      ];

      const oldContent = oldMessage.content || '*(leere Nachricht)*';
      const newContent = newMessage.content || '*(leere Nachricht)*';
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
          title: 'Nachricht bearbeitet',
          lines: metaLines,
          quoted: true,
          fields: [
            { name: 'Vorher', value: oldContentTruncated, inline: true },
            { name: 'Nachher', value: newContentTruncated, inline: true },
          ],
          userId: newMessage.author?.id,
          channelId: newMessage.channel.id,
        }
      });

    } catch (error) {
      logger.error('Error in messageUpdate event:', error);
    }
  }
} satisfies BotEvent<Events.MessageUpdate>;
