import { Events, AuditLogEvent } from 'discord.js';
import { getGuildConfig } from '../../services/guildConfigService.js';
import { isEventEnabled } from '../../services/loggingService.js';
import { resolveLogChannel } from '../../utils/logChannel.js';
import { fetchExecutor, executorText } from '../../utils/auditLog.js';
import { createLogEmbed } from '../../utils/logEmbed.js';

export default {
  name: Events.MessageBulkDelete,

  async execute(messages, channel, client) {
    const guild = channel?.guild;
    if (!guild) return;

    const config = await getGuildConfig(client.db, guild.id);
    if (!isEventEnabled(config, 'message.bulkdelete')) return;

    const logChannel = await resolveLogChannel(guild, config, 'message');
    if (!logChannel) return;

    const executor = await fetchExecutor(guild, AuditLogEvent.MessageBulkDelete, {
      windowMs: 8000,
    });

    const embed = createLogEmbed({
      title: '🗑️ Borrado Masivo de Mensajes',
      color: '#FF0000',
      fields: [
        {
          name: '💬 Canal',
          value: `${channel}\n🆔 \`${channel.id}\``,
          inline: true,
        },
        {
          name: '🔢 Cantidad',
          value: `${messages.size} mensajes`,
          inline: true,
        },
        {
          name: '🧑‍💼 Ejecutado por',
          value: executorText(executor),
          inline: false,
        },
      ],
      footer: `Servidor: ${guild.name}`,
    });

    await logChannel.send({ embeds: [embed] });
  },
};
