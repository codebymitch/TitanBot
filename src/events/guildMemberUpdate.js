import { Events, AuditLogEvent } from 'discord.js';
import { logEvent, EVENT_TYPES } from '../services/loggingService.js';
import { logger } from '../utils/logger.js';
import { sendLog } from '../utils/discordLogger.js';

export default {
  name: Events.GuildMemberUpdate,
  once: false,

  async execute(oldMember, newMember) {
    try {
      if (!newMember.guild) return;

      const fields = [];

      // 👤 Usuario
      fields.push({
        name: '👤 Member',
        value: `${newMember.user.tag} (${newMember.user.id})`,
        inline: true
      });

      // =========================================
      // ✏️ CAMBIO DE NICKNAME
      // =========================================
      if (oldMember.nickname !== newMember.nickname) {

        fields.push({
          name: '🏷️ Old Nickname',
          value: oldMember.nickname || '*(no nickname)*',
          inline: true
        });

        fields.push({
          name: '🏷️ New Nickname',
          value: newMember.nickname || '*(no nickname)*',
          inline: true
        });

        await logEvent({
          client: newMember.client,
          guildId: newMember.guild.id,
          eventType: EVENT_TYPES.MEMBER_NAME_CHANGE,
          data: {
            description: `Member nickname changed: ${newMember.user.tag}`,
            userId: newMember.user.id,
            fields
          }
        });

        await sendLog({
          title: '✏️ Cambio de nickname',
          description: `${newMember.user.tag}`,
          color: 0x00ffff,
          fields: [
            {
              name: 'Antes',
              value: oldMember.nickname || 'Ninguno',
              inline: true
            },
            {
              name: 'Ahora',
              value: newMember.nickname || 'Ninguno',
              inline: true
            }
          ]
        });

        return;
      }

      // =========================================
      // 🧠 CAMBIO DE AVATAR
      // =========================================
      const oldAvatar = oldMember.user.displayAvatarURL({ size: 1024 });
      const newAvatar = newMember.user.displayAvatarURL({ size: 1024 });

      if (oldAvatar !== newAvatar) {

        await logEvent({
          client: newMember.client,
          guildId: newMember.guild.id,
          eventType: EVENT_TYPES.MEMBER_UPDATE,
          data: {
            description: `Avatar changed: ${newMember.user.tag}`,
            userId: newMember.user.id
          }
        });

        await sendLog({
          title: '🧠 Cambio de avatar',
          description: `${newMember.user.tag} cambió su avatar`,
          color: 0x5865f2,
          thumbnail: newAvatar,
          fields: [
            {
              name: 'Antes',
              value: `[Ver avatar](${oldAvatar})`,
              inline: true
            },
            {
              name: 'Ahora',
              value: `[Ver avatar](${newAvatar})`,
              inline: true
            }
          ]
        });

        return;
      }

      // =========================================
      // 🎭 CAMBIO DE ROLES (🔥 NUEVO COMPLETO)
      // =========================================
      const oldRoles = oldMember.roles.cache;
      const newRoles = newMember.roles.cache;

      const addedRoles = newRoles.filter(r => !oldRoles.has(r.id));
      const removedRoles = oldRoles.filter(r => !newRoles.has(r.id));

      if (addedRoles.size > 0 || removedRoles.size > 0) {

        let executor = 'Desconocido';

        try {
          const fetchedLogs = await newMember.guild.fetchAuditLogs({
            limit: 1,
            type: AuditLogEvent.MemberRoleUpdate
          });

          const log = fetchedLogs.entries.first();

          if (
            log &&
            log.target.id === newMember.id &&
            Date.now() - log.createdTimestamp < 5000
          ) {
            executor = log.executor?.tag || 'Desconocido';
          }

        } catch (err) {
          logger.warn('Error leyendo audit logs (roles):', err);
        }

        // ➕ Roles añadidos
        if (addedRoles.size > 0) {
          await sendLog({
            title: '➕ Roles añadidos',
            description: `${newMember.user.tag}`,
            color: 0x00ff00,
            fields: [
              {
                name: 'Roles',
                value: addedRoles.map(r => r.name).join(', '),
                inline: false
              },
              {
                name: '🧑‍💼 Añadido por',
                value: executor,
                inline: true
              }
            ]
          });
        }

        // ➖ Roles removidos
        if (removedRoles.size > 0) {
          await sendLog({
            title: '➖ Roles removidos',
            description: `${newMember.user.tag}`,
            color: 0xff0000,
            fields: [
              {
                name: 'Roles',
                value: removedRoles.map(r => r.name).join(', '),
                inline: false
              },
              {
                name: '🧑‍💼 Removido por',
                value: executor,
                inline: true
              }
            ]
          });
        }

        return;
      }

    } catch (error) {
      logger.error('Error in guildMemberUpdate event:', error);
    }
  }
};