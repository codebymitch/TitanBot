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

      // Role changes (skipped when the old member isn't cached, since we can't diff roles)
      if (oldMember.partial) {
        logger.warn(
          `guildMemberUpdate: old member ${newMember.user?.id} not cached in guild ${newMember.guild.id}; role change cannot be detected`
        );
      } else {
        const guildId = newMember.guild.id;
        const changes = [
          {
            eventType: EVENT_TYPES.MEMBER_ROLE_ADD,
            title: 'Role received',
            roles: newMember.roles.cache.filter((r) => !oldMember.roles.cache.has(r.id) && r.id !== guildId),
          },
          {
            eventType: EVENT_TYPES.MEMBER_ROLE_REMOVE,
            title: 'Role removed',
            roles: oldMember.roles.cache.filter((r) => !newMember.roles.cache.has(r.id) && r.id !== guildId),
          },
        ];

        for (const { eventType, title, roles } of changes) {
          for (const role of roles.values()) {
            const sent = await logEvent({
              client: newMember.client,
              guildId,
              eventType,
              data: {
                title,
                lines: [
                  `**User:** ${newMember.user.toString()} (${newMember.user.tag})`,
                  `**ID:** \`${newMember.user.id}\``,
                  `**Role:** ${role.toString()} (${role.name})`,
                ],
                thumbnail: newMember.user.displayAvatarURL({ dynamic: true }),
                userId: newMember.user.id,
              }
            });

            if (!sent) {
              logger.warn(
                `Role alert (${eventType}) for ${newMember.user.id} in guild ${guildId} was not sent. ` +
                'Check /logging dashboard: audit log must be enabled, an audit channel set, the Members category on, ' +
                'and the bot needs Send Messages + Embed Links in that channel.'
              );
            }
          }
        }
      }

    } catch (error) {
      logger.error('Error in guildMemberUpdate event:', error);
    }
  }
};