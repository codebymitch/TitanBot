import { Events, AuditLogEvent } from 'discord.js';
import { getGuildConfig } from '../../services/guildConfigService.js';
import { isEventEnabled } from '../../services/loggingService.js';
import { resolveLogChannel, channelTypeName } from '../../utils/logChannel.js';
import { fetchExecutor, executorText } from '../../utils/auditLog.js';
import { createLogEmbed } from '../../utils/logEmbed.js';

export default {
  name: Events.ChannelDelete,

  async execute(channel, client) {
    const guild = channel.guild;
    if (!guild) return;

    const config = await getGuildConfig(client.db, guild.id);
    if (!isEventEnabled(config, 'channel.delete')) return;

    const logChannel = await resolveLogChannel(guild, config, 'channel');
    if (!logChannel) return;

    const executor = await fetchExecutor(guild, AuditLogEvent.ChannelDelete, {
      targetId: channel.id,
    });

    const embed = createLogEmbed({
      title: '🗂️ Canal Eliminado',
      color: '#e74c3c',
      fields: [
        {
          name: '📦 Canal',
          value: `\`${channel.name}\`\n🆔 \`${channel.id}\``,
          inline: true,
        },
        {
          name: '🔧 Tipo',
          value: channelTypeName(channel.type),
          inline: true,
        },
        {
          name: '🗂️ Categoría',
          value: channel.parent ? channel.parent.name : 'Ninguna',
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
