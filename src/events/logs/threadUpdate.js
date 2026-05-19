import { Events, AuditLogEvent } from 'discord.js';
import { getGuildConfig } from '../../services/guildConfigService.js';
import { isEventEnabled } from '../../services/loggingService.js';
import { resolveLogChannel } from '../../utils/logChannel.js';
import { fetchExecutor, executorText } from '../../utils/auditLog.js';
import { createLogEmbed } from '../../utils/logEmbed.js';

export default {
  name: Events.ThreadUpdate,

  async execute(oldThread, newThread, client) {
    const guild = newThread.guild;
    if (!guild) return;

    const config = await getGuildConfig(client.db, guild.id);
    if (!isEventEnabled(config, 'thread.update')) return;

    const changes = [];

    if (oldThread.name !== newThread.name) {
      changes.push(`**Nombre:** \`${oldThread.name}\` → \`${newThread.name}\``);
    }
    if (oldThread.archived !== newThread.archived) {
      changes.push(`**Archivado:** ${oldThread.archived ? 'Sí' : 'No'} → ${newThread.archived ? 'Sí' : 'No'}`);
    }
    if (oldThread.locked !== newThread.locked) {
      changes.push(`**Bloqueado:** ${oldThread.locked ? 'Sí' : 'No'} → ${newThread.locked ? 'Sí' : 'No'}`);
    }
    if (oldThread.rateLimitPerUser !== newThread.rateLimitPerUser) {
      changes.push(
        `**Modo lento:** ${oldThread.rateLimitPerUser || 0}s → ${newThread.rateLimitPerUser || 0}s`
      );
    }

    if (changes.length === 0) return;

    const logChannel = await resolveLogChannel(guild, config, 'channel');
    if (!logChannel) return;

    const executor = await fetchExecutor(guild, AuditLogEvent.ThreadUpdate, {
      targetId: newThread.id,
    });

    const embed = createLogEmbed({
      title: '✏️ Hilo Editado',
      color: '#3498db',
      fields: [
        {
          name: '🧵 Hilo',
          value: `${newThread}\n🆔 \`${newThread.id}\``,
          inline: false,
        },
        {
          name: '📝 Cambios',
          value: changes.join('\n'),
          inline: false,
        },
        {
          name: '🧑‍💼 Editado por',
          value: executorText(executor),
          inline: false,
        },
      ],
      footer: `Servidor: ${guild.name}`,
    });

    await logChannel.send({ embeds: [embed] });
  },
};
