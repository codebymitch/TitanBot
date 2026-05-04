import { Events } from 'discord.js';
import { logEvent, EVENT_TYPES } from '../services/loggingService.js';
import { logger } from '../utils/logger.js';
import { getReactionRoleMessage, deleteReactionRoleMessage } from '../services/reactionRoleService.js';
import { snipeCache } from '../utils/snipeCache.js';

const MAX_LOGGED_MESSAGE_CONTENT_LENGTH = 1024;

export default {
  name: Events.MessageDelete,
  once: false,

  async execute(message) {
    try {
      if (!message.guild) return;

      try {
        const reactionRoleData = await getReactionRoleMessage(message.client, message.guild.id, message.id);
        if (reactionRoleData) {
          await deleteReactionRoleMessage(message.client, message.guild.id, message.id);
          logger.info(`Cleaned up reaction role database entry for manually deleted message ${message.id} in guild ${message.guild.id}`);

          try {
            await logEvent({
              client: message.client,
              guildId: message.guild.id,
              eventType: EVENT_TYPES.REACTION_ROLE_DELETE,
              data: {
                description: `Reaction role message was deleted manually and removed from database.`,
                channelId: message.channel?.id,
                fields: [
                  {
                    name: '🗑️ Message ID',
                    value: message.id,
                    inline: true
                  },
                  {
                    name: '📍 Channel',
                    value: message.channel ? `${message.channel.toString()} (${message.channel.id})` : 'Unknown',
                    inline: true
                  },
                  {
                    name: '🧹 Cleanup',
                    value: 'Database entry removed automatically',
                    inline: false
                  }
                ]
              }
            });
          } catch (logCleanupError) {
            logger.warn('Failed to log reaction role cleanup after manual message deletion:', logCleanupError);
          }
        }
      } catch (reactionRoleCleanupError) {
        logger.warn(`Failed to clean up reaction role data for deleted message ${message.id}:`, reactionRoleCleanupError);
      }

      if (message.author?.bot) return;

      if (message.content || message.attachments.size > 0) {
        snipeCache.set(message.channel.id, {
          content: message.content,
          author: message.author ? `${message.author.tag} (${message.author.id})` : 'Unknown',
          attachmentUrl: message.attachments.first()?.url ?? null,
          timestamp: message.createdTimestamp,
        });
      }

      const fields = [];

      
      if (message.author) {
        fields.push({
          name: '👤 Author',
          value: `${message.author.tag} (${message.author.id})`,
          inline: true
        });
      }

      
      fields.push({
        name: '💬 Channel',
        value: `${message.channel.toString()} (${message.channel.id})`,
        inline: true
      });

      
      if (message.content) {
        const content = message.content.length > MAX_LOGGED_MESSAGE_CONTENT_LENGTH 
          ? message.content.substring(0, MAX_LOGGED_MESSAGE_CONTENT_LENGTH - 3) + '...' 
          : message.content;
        fields.push({
          name: '📝 Content',
          value: content || '*(empty message)*',
          inline: false
        });
      }

      
      fields.push({
        name: '🆔 Message ID',
        value: message.id,
        inline: true
      });

      
      fields.push({
        name: '📅 Created',
        value: `<t:${Math.floor(message.createdTimestamp / 1000)}:R>`,
        inline: true
      });

      
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
