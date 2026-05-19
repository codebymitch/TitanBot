import { Events, AuditLogEvent } from 'discord.js';
import { getGuildConfig } from '../../services/guildConfigService.js';
import { isEventEnabled } from '../../services/loggingService.js';
import { resolveLogChannel } from '../../utils/logChannel.js';
import { fetchExecutor, executorText } from '../../utils/auditLog.js';
import { createLogEmbed } from '../../utils/logEmbed.js';

export default {
  name: Events.ThreadDelete,

  async execute(thread, client) {
    const guild = thread.guild;
    if (!guild) return;

    const config = await getGuildConfig(client.db, guild.id);
    if (!isEventEnabled(config, 'thread.delete')) return;

    const logChannel = await resolveLogChannel(guild, config, 'channel');
    if (!logChannel) return;

    const executor = await fetchExecutor(guild, AuditLogEvent.ThreadDelete, {
      targetId: thread.id,
    });

    const embed = createLogEmbed({
      title: '🗑️ Hilo Eliminado',
      color: '#e74c3c',
      fields: [
        {
          name: '🧵 Hilo',
          value: `\`${thread.name}\`\n🆔 \`${thread.id}\``,
          inline: true,
        },
        {
          name: '📦 En canal',
          value: thread.parent ? `${thread.parent}` : 'Desconocido',
          inline: true,
        },
        {
          name: '🧑‍💼 Eliminado por',
          value: executorText(executor),
          inline: false,
        },
      ],
      footer: `Servidor: ${guild.name}`,
    });

    await logChannel.send({ embeds: [embed] });
  },
};
