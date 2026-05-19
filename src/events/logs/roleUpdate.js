import { Events, AuditLogEvent } from 'discord.js';
import { getGuildConfig } from '../../services/guildConfigService.js';
import { isEventEnabled } from '../../services/loggingService.js';
import { createLogEmbed } from '../../utils/logEmbed.js';

export default {
  name: Events.GuildMemberUpdate,

  async execute(oldMember, newMember, client) {

    if (!oldMember.guild) return;

    const config = await getGuildConfig(
      client.db,
      oldMember.guild.id
    );

    if (!isEventEnabled(config, 'role.update')) return;

    let logChannel = null;

    // 🔥 CATEGORY
    if (config.logs?.categories?.role) {
      logChannel =
        oldMember.guild.channels.cache.get(config.logs.categories.role)
        || await oldMember.guild.channels
          .fetch(config.logs.categories.role)
          .catch(() => null);
    }

    // 🔥 FALLBACK
    if (!logChannel && config.logs?.channel) {
      logChannel =
        oldMember.guild.channels.cache.get(config.logs.channel)
        || await oldMember.guild.channels
          .fetch(config.logs.channel)
          .catch(() => null);
    }

    if (!logChannel) return;

    // 🔥 DETECTAR CAMBIOS
    const addedRoles = newMember.roles.cache.filter(
      role => !oldMember.roles.cache.has(role.id)
    );

    const removedRoles = oldMember.roles.cache.filter(
      role => !newMember.roles.cache.has(role.id)
    );

    if (!addedRoles.size && !removedRoles.size) return;

    // 🔥 ESPERAR AUDIT LOG
    let executor = 'Desconocido';

    try {
      await new Promise(res => setTimeout(res, 500));

      const fetchedLogs = await oldMember.guild.fetchAuditLogs({
        limit: 5,
        type: AuditLogEvent.MemberRoleUpdate
      });

      const log = fetchedLogs.entries.find(entry =>
        entry.target?.id === newMember.id &&
        Date.now() - entry.createdTimestamp < 5000
      );

      if (log) {
        executor = `${log.executor.tag} (${log.executor.id})`;
      }

    } catch (err) {
      console.log('⚠️ Audit logs roles no disponibles');
    }

    // 🔥 FORMATO
    const added = addedRoles.map(r => `<@&${r.id}>`).join('\n') || 'Ninguno';
    const removed = removedRoles.map(r => `<@&${r.id}>`).join('\n') || 'Ninguno';

    const executorText =
      executor === 'Desconocido'
        ? 'No se pudo determinar'
        : executor;

    const embed = createLogEmbed({
      title: '🎭 Roles Updated',
      color: '#00c3ff',
      user: newMember.user,
      fields: [
        {
          name: '👤 Usuario',
          value: `${newMember.user}\n🆔 \`${newMember.id}\``,
          inline: false
        },
        {
          name: '🧑‍💼 Cambiado por',
          value: executorText,
          inline: false
        },
        {
          name: '➕ Roles añadidos',
          value: added,
          inline: true
        },
        {
          name: '➖ Roles removidos',
          value: removed,
          inline: true
        }
      ],
      footer: `Servidor: ${newMember.guild.name}`
    });

    await logChannel.send({ embeds: [embed] });

  }
};