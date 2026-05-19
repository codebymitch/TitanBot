import { Events, AuditLogEvent } from 'discord.js';
import { getGuildConfig } from '../../services/guildConfigService.js';
import { isEventEnabled } from '../../services/loggingService.js';
import { resolveLogChannel } from '../../utils/logChannel.js';
import { fetchExecutor, executorText } from '../../utils/auditLog.js';
import { createLogEmbed } from '../../utils/logEmbed.js';

export default {
  name: Events.ThreadCreate,

  async execute(thread, client) {
    const guild = thread.guild;
    if (!guild) return;

    const config = await getGuildConfig(client.db, guild.id);
    if (!isEventEnabled(config, 'thread.create')) return;

    const logChannel = await resolveLogChannel(guild, config, 'channel');
    if (!logChannel) return;

    const executor = await fetchExecutor(guild, AuditLogEvent.ThreadCreate, {
      targetId: thread.id,
    });

    const embed = createLogEmbed({
      title: '🧵 Hilo Creado',
      color: '#2ecc71',
      fields: [
        {
          name: '🧵 Hilo',
          value: `${thread}\n\`${thread.name}\`\n🆔 \`${thread.id}\``,
          inline: true,
        },
        {
          name: '📦 En canal',
          value: thread.parent ? `${thread.parent}` : 'Desconocido',
          inline: true,
        },
        {
          name: '🧑‍💼 Creado por',
          value: executorText(executor),
          inline: false,
        },
      ],
      footer: `Servidor: ${guild.name}`,
    });

    await logChannel.send({ embeds: [embed] });
  },
};
