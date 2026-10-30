import { Events } from 'discord.js';
import { logEvent, EVENT_TYPES } from '../services/loggingService.js';
import { logger } from '../utils/logger.js';
import { formatLogLine } from '../utils/logging/logEmbeds.js';
import { handleForeignInviteLink } from '../services/inviteLinkGuardService.js';
import { handleMediaMessage } from '../services/mediaRoleService.js';
import { handleChatFilter } from '../services/moderation/chatFilterService.js';
import { handleGamesBotWin } from '../services/cc/gamesBotWins.js';
import { isHomeGuild } from '../config/homeGuild.js';

const MAX_LOGGED_EDIT_CONTENT_LENGTH = 512;

/**
 * The edited message with its author known. Discord sends an edit of an old (uncached) message as a
 * partial with no author, so a games bot (Clover) editing its game messages looked like a member's edit
 * and landed in the edit log. In our server such a message is fetched first; null when it can't be.
 */
export async function resolveEditedMessage(message) {
  if (!message?.partial || !isHomeGuild(message.guild?.id ?? message.guildId)) return message;
  return message.fetch().catch(() => null);
}

export default {
  name: Events.MessageUpdate,
  once: false,

  async execute(oldMessage, editedMessage) {
    try {
      const newMessage = await resolveEditedMessage(editedMessage);
      if (!newMessage) return;
      // A games bot (Clover) message edited into a win result pays CC (once per message).
      if (newMessage.guild && newMessage.author?.bot && !newMessage.partial) {
        await handleGamesBotWin(newMessage, newMessage.client);
        return;
      }
      if (!newMessage.guild || newMessage.author?.bot) return;
      // Bots' and webhooks' edits (games, panels) are never logged; neither is an edit whose author is unknown.
      if (isHomeGuild(newMessage.guild.id) && (newMessage.webhookId || !newMessage.author)) return;

      if (oldMessage.content === newMessage.content) return;

      // An edit must not sneak in an insult, an invite to another server, or a link without the media role.
      if (!newMessage.partial && !(await handleChatFilter(newMessage)) && !(await handleForeignInviteLink(newMessage))) await handleMediaMessage(newMessage);

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
