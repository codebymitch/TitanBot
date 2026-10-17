import { Events } from 'discord.js';
import { logEvent, EVENT_TYPES } from '../services/loggingService.js';
import { logger } from '../utils/logger.js';
import type { BotEvent } from '../types/index.js';

export default {
  name: Events.GuildMemberUpdate,
  once: false,

  async execute(oldMember, newMember) {
    try {
      if (!newMember.guild) return;

      if (oldMember.nickname !== newMember.nickname) {
        await logEvent({
          client: newMember.client,
          guildId: newMember.guild.id,
          eventType: EVENT_TYPES.MEMBER_NAME_CHANGE,
          data: {
            title: 'Nickname geändert',
            lines: [
              `**Nutzer:** ${newMember.user.toString()} (${newMember.user.tag})`,
              `**ID:** \`${newMember.user.id}\``,
              `**Vorher:** ${oldMember.nickname || '*(kein Nickname)*'}`,
              `**Nachher:** ${newMember.nickname || '*(kein Nickname)*'}`,
            ],
            thumbnail: newMember.user.displayAvatarURL(),
            userId: newMember.user.id,
          }
        });

        return;
      }

    } catch (error) {
      logger.error('Error in guildMemberUpdate event:', error);
    }
  }
} satisfies BotEvent<Events.GuildMemberUpdate>;