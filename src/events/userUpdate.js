import { Events } from 'discord.js';
import { logEvent, EVENT_TYPES } from '../services/loggingService.js';
import { logger } from '../utils/logger.js';

export default {
  name: Events.UserUpdate,
  once: false,

  async execute(oldUser, newUser) {
    try {
      if (oldUser.bot) return;

      const usernameChanged = oldUser.username !== newUser.username;
      const discriminatorChanged = oldUser.discriminator !== newUser.discriminator;

      if (!usernameChanged && !discriminatorChanged) return;

      const fields = [];

      if (usernameChanged) {
        fields.push({
          name: '🏷️ Old Username',
          value: oldUser.username,
          inline: true
        });
        fields.push({
          name: '🏷️ New Username',
          value: newUser.username,
          inline: true
        });
      }

      if (discriminatorChanged) {
        fields.push({
          name: '🔢 Old Tag',
          value: `#${oldUser.discriminator}`,
          inline: true
        });
        fields.push({
          name: '🔢 New Tag',
          value: `#${newUser.discriminator}`,
          inline: true
        });
      }

      const guilds = [...newUser.client.guilds.cache.values()];
      for (const guild of guilds) {
        if (!guild.members.cache.has(newUser.id)) continue;

        await logEvent({
          client: newUser.client,
          guildId: guild.id,
          eventType: EVENT_TYPES.MEMBER_NAME_CHANGE,
          data: {
            description: `${newUser.tag} updated their username`,
            userId: newUser.id,
            fields: [
              {
                name: '👤 User',
                value: `${newUser.tag} (${newUser.id})`,
                inline: true
              },
              ...fields
            ]
          }
        });
      }

      logger.debug(`Processed userUpdate for ${newUser.id} across ${guilds.length} guild(s)`);
    } catch (error) {
      logger.error('Error in userUpdate event:', error);
    }
  }
};
