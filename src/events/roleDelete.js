import { Events, AuditLogEvent } from 'discord.js';
import { logEvent, EVENT_TYPES } from '../services/loggingService.js';
import { logger } from '../utils/logger.js';
import { buildRoleAuditFields } from '../utils/roleLogFields.js';
import { sendLog } from '../utils/discordLogger.js';

export default {
  name: Events.GuildRoleDelete,
  once: false,

  async execute(role) {
    try {
      if (!role.guild) return;

      const fields = buildRoleAuditFields(role, { includeMemberCount: true });

      // 🔍 AUDIT LOG
      let executor = 'Desconocido';

      try {
        const fetchedLogs = await role.guild.fetchAuditLogs({
          limit: 1,
          type: AuditLogEvent.RoleDelete
        });

        const log = fetchedLogs.entries.first();

        if (log && log.target.id === role.id) {
          executor = log.executor?.tag || 'Desconocido';
        }

      } catch (err) {
        logger.warn('Error leyendo audit logs (roleDelete):', err);
      }

      // 🔥 TU SISTEMA
      await logEvent({
        client: role.client,
        guildId: role.guild.id,
        eventType: EVENT_TYPES.ROLE_DELETE,
        data: {
          description: `A role was deleted: ${role.name}`,
          fields
        }
      });

      // 🔥 DISCORD LOG
      await sendLog({
        title: '🗑️ Rol eliminado',
        description: `${role.name}`,
        color: 0xff0000,
        fields: [
          {
            name: '🧑‍💼 Eliminado por',
            value: executor,
            inline: true
          },
          {
            name: '🆔 ID',
            value: role.id,
            inline: true
          }
        ]
      });

    } catch (error) {
      logger.error('Error in roleDelete event:', error);
    }
  }
};