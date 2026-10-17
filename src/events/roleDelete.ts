import { Events } from 'discord.js';
import { logEvent, EVENT_TYPES } from '../services/loggingService.js';
import { logger } from '../utils/logger.js';
import { buildRoleAuditLines } from '../utils/logging/logEmbeds.js';
import type { BotEvent } from '../types/index.js';

export default {
  name: Events.GuildRoleDelete,
  once: false,

  async execute(role) {
    try {
      if (!role.guild) return;

      const lines = buildRoleAuditLines(role, { includeMemberCount: true });

      await logEvent({
        client: role.client,
        guildId: role.guild.id,
        eventType: EVENT_TYPES.ROLE_DELETE,
        data: {
          title: 'Rolle gelöscht',
          headline: `**${role.name}** wurde gelöscht`,
          lines,
        },
      });

    } catch (error) {
      logger.error('Error in roleDelete event:', error);
    }
  }
} satisfies BotEvent<Events.GuildRoleDelete>;