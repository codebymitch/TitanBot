import { Events, AuditLogEvent } from 'discord.js';
import { logEvent, EVENT_TYPES } from '../services/loggingService.js';
import { logger } from '../utils/logger.js';
import { buildRoleAuditFields } from '../utils/roleLogFields.js';
import { sendLog } from '../utils/discordLogger.js';

export default {
  name: Events.GuildRoleCreate,
  once: false,

  async execute(role) {
    try {
      if (!role.guild) return;

      const fields = buildRoleAuditFields(role);

      // 🔍 AUDIT LOG
      let executor = 'Desconocido';

      try {
        const fetchedLogs = await role.guild.fetchAuditLogs({
          limit: 1,
          type: AuditLogEvent.RoleCreate
        });

        const log = fetchedLogs.entries.first();

        if (log && log.target.id === role.id) {
          executor = log.executor?.tag || 'Desconocido';
        }

      } catch (err) {
        logger.warn('Error leyendo audit logs (roleCreate):', err);
      }

      // 🔥 TU SISTEMA
      await logEvent({
        client: role.client,
        guildId: role.guild.id,
        eventType: EVENT_TYPES.ROLE_CREATE,
        data: {
          description: `A new role was created: ${role.toString()}`,
          fields
        }
      });

      // 🔥 DISCORD LOG
      await sendLog({
        title: '🆕 Rol creado',
        description: `${role.name}`,
        color: 0x00ff00,
        fields: [
          {
            name: '🧑‍💼 Creado por',
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
      logger.error('Error in roleCreate event:', error);
    }
  }
};