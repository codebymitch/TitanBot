import { Events, AuditLogEvent } from 'discord.js';
import { getGuildConfig } from '../../services/guildConfigService.js';
import { isEventEnabled } from '../../services/loggingService.js';
import { resolveLogChannel } from '../../utils/logChannel.js';
import { fetchExecutor, executorText } from '../../utils/auditLog.js';
import { createLogEmbed } from '../../utils/logEmbed.js';

export default {
  name: Events.ChannelUpdate,

  async execute(oldChannel, newChannel, client) {
    const guild = newChannel.guild;
    if (!guild) return;

    const config = await getGuildConfig(client.db, guild.id);
    if (!isEventEnabled(config, 'channel.update')) return;

    const changes = [];

    if (oldChannel.name !== newChannel.name) {
      changes.push(`**Nombre:** \`${oldChannel.name}\` → \`${newChannel.name}\``);
    }
    if (oldChannel.topic !== newChannel.topic) {
      changes.push(
        `**Tema:** ${oldChannel.topic ? `\`${oldChannel.topic.slice(0, 100)}\`` : '*vacío*'} → ${newChannel.topic ? `\`${newChannel.topic.slice(0, 100)}\`` : '*vacío*'}`
      );
    }
    if (oldChannel.nsfw !== newChannel.nsfw) {
      changes.push(`**NSFW:** ${oldChannel.nsfw ? 'Sí' : 'No'} → ${newChannel.nsfw ? 'Sí' : 'No'}`);
    }
    if (oldChannel.rateLimitPerUser !== newChannel.rateLimitPerUser) {
      changes.push(
        `**Modo lento:** ${oldChannel.rateLimitPerUser || 0}s → ${newChannel.rateLimitPerUser || 0}s`
      );
    }
    if (oldChannel.parentId !== newChannel.parentId) {
      changes.push(
        `**Categoría:** ${oldChannel.parent?.name || 'Ninguna'} → ${newChannel.parent?.name || 'Ninguna'}`
      );
    }

    if (changes.length === 0) return;

    const logChannel = await resolveLogChannel(guild, config, 'channel');
    if (!logChannel) return;

    const executor = await fetchExecutor(guild, AuditLogEvent.ChannelUpdate, {
      targetId: newChannel.id,
    });

    const embed = createLogEmbed({
      title: '✏️ Canal Editado',
      color: '#3498db',
      fields: [
        {
          name: '📦 Canal',
          value: `${newChannel}\n🆔 \`${newChannel.id}\``,
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
