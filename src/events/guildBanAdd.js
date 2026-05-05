import { Events, AuditLogEvent } from 'discord.js';
import { sendLog } from '../utils/discordLogger.js';
import { logger } from '../utils/logger.js';

export default {
  name: Events.GuildBanAdd,

  async execute(ban) {
    try {
      const { guild, user } = ban;

      // 🔍 Buscar en audit logs
      const fetchedLogs = await guild.fetchAuditLogs({
        limit: 1,
        type: AuditLogEvent.MemberBanAdd
      });

      const log = fetchedLogs.entries.first();

      let executor = 'Desconocido';
      let reason = 'Sin razón';

      if (log) {
        executor = log.executor?.tag || 'Desconocido';
        reason = log.reason || 'Sin razón';
      }

      // 📊 Enviar log
      await sendLog({
        title: '🔨 Usuario baneado',
        description: `${user.tag} fue baneado`,
        color: 0xff0000,
        fields: [
          {
            name: '👤 Usuario',
            value: `${user.tag} (${user.id})`,
            inline: true
          },
          {
            name: '🛡️ Moderador',
            value: executor,
            inline: true
          },
          {
            name: '📄 Razón',
            value: reason,
            inline: false
          }
        ]
      });

    } catch (error) {
      logger.error('Error en guildBanAdd:', error);
    }
  }
};