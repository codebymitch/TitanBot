import { Events, AuditLogEvent } from 'discord.js';
import { logEvent, EVENT_TYPES } from '../services/loggingService.js';
import { logger } from '../utils/logger.js';
import { getReactionRoleMessage, deleteReactionRoleMessage } from '../services/reactionRoleService.js';
import { sendLog } from '../utils/discordLogger.js';

const MAX_LOGGED_MESSAGE_CONTENT_LENGTH = 1024;

export default {
  name: Events.MessageDelete,
  once: false,

  async execute(message) {
    try {
      if (!message.guild) return;

      // 🔥 =========================
      // 🧠 DETECTAR QUIÉN BORRÓ EL MENSAJE
      // 🔥 =========================
      let deletedBy = 'Autor del mensaje';
      let isModDelete = false;

      try {
        const fetchedLogs = await message.guild.fetchAuditLogs({
          limit: 1,
          type: AuditLogEvent.MessageDelete
        });

        const log = fetchedLogs.entries.first();

        if (
          log &&
          message.author &&
          log.target?.id === message.author.id &&
          log.extra?.channel?.id === message.channel.id &&
          Date.now() - log.createdTimestamp < 5000
        ) {
          deletedBy = log.executor?.tag || 'Desconocido';
          isModDelete = true;
        }

      } catch (auditError) {
        logger.warn('Error leyendo audit logs:', auditError);
      }

      // 🧹 REACTION ROLES (NO TOCADO)
      try {
        const reactionRoleData = await getReactionRoleMessage(message.client, message.guild.id, message.id);
        if (reactionRoleData) {
          await deleteReactionRoleMessage(message.client, message.guild.id, message.id);
        }
      } catch (err) {
        logger.warn('Error limpiando reaction roles:', err);
      }

      if (message.author?.bot) return;

      const fields = [];

      // 👤 Autor
      if (message.author) {
        fields.push({
          name: '👤 Author',
          value: `${message.author.tag} (${message.author.id})`,
          inline: true
        });
      }

      // 💬 Canal
      fields.push({
        name: '💬 Channel',
        value: `${message.channel.toString()} (${message.channel.id})`,
        inline: true
      });

      // 🧹 Quién lo borró
      fields.push({
        name: '🧹 Eliminado por',
        value: deletedBy,
        inline: true
      });

      // 📝 Contenido
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

      // 🆔 ID
      fields.push({
        name: '🆔 Message ID',
        value: message.id,
        inline: true
      });

      // 📅 Fecha
      fields.push({
        name: '📅 Created',
        value: `<t:${Math.floor(message.createdTimestamp / 1000)}:R>`,
        inline: true
      });

      // 📎 Adjuntos
      if (message.attachments.size > 0) {
        fields.push({
          name: '📎 Attachments',
          value: message.attachments.size.toString(),
          inline: true
        });
      }

      // 🔥 TU SISTEMA ORIGINAL
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

      // 🔥 DISCORD LOG MEJORADO
      await sendLog({
        title: isModDelete
          ? '🛡️ Mensaje eliminado por moderador'
          : '🗑️ Mensaje eliminado',
        description: `En ${message.channel.toString()}`,
        color: isModDelete ? 0xff9900 : 0xff0000,
        fields
      });

    } catch (error) {
      logger.error('Error in messageDelete event:', error);
    }
  }
};