import { Events } from 'discord.js';
import { logEvent, EVENT_TYPES } from '../services/loggingService.js';
import { logger } from '../utils/logger.js';

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
            title: 'Nickname changed',
            lines: [
              `**User:** ${newMember.user.toString()} (${newMember.user.tag})`,
              `**ID:** \`${newMember.user.id}\``,
              `**Before:** ${oldMember.nickname || '*(no nickname)*'}`,
              `**After:** ${newMember.nickname || '*(no nickname)*'}`,
            ],
            thumbnail: newMember.user.displayAvatarURL({ dynamic: true }),
            userId: newMember.user.id,
          }
        });
      }

      // Role additions (skipped when the old member isn't cached, since we can't diff roles)
      if (!oldMember.partial) {
        const addedRoles = newMember.roles.cache.filter(
          (role) => !oldMember.roles.cache.has(role.id) && role.id !== newMember.guild.id
        );

        for (const role of addedRoles.values()) {
          await logEvent({
            client: newMember.client,
            guildId: newMember.guild.id,
            eventType: EVENT_TYPES.MEMBER_ROLE_ADD,
            data: {
              title: 'Role received',
              lines: [
                `**User:** ${newMember.user.toString()} (${newMember.user.tag})`,
                `**ID:** \`${newMember.user.id}\``,
                `**Role:** ${role.toString()} (${role.name})`,
              ],
              thumbnail: newMember.user.displayAvatarURL({ dynamic: true }),
              userId: newMember.user.id,
            }
          });
        }
      }

    } catch (error) {
      logger.error('Error in guildMemberUpdate event:', error);
    }
  }
};