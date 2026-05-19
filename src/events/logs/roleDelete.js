import { Events, AuditLogEvent } from 'discord.js';
import { getGuildConfig } from '../../services/guildConfigService.js';
import { isEventEnabled } from '../../services/loggingService.js';
import { resolveLogChannel } from '../../utils/logChannel.js';
import { fetchExecutor, executorText } from '../../utils/auditLog.js';
import { createLogEmbed } from '../../utils/logEmbed.js';

export default {
  name: Events.GuildRoleDelete,

  async execute(role, client) {
    const guild = role.guild;
    if (!guild) return;

    const config = await getGuildConfig(client.db, guild.id);
    if (!isEventEnabled(config, 'role.delete')) return;

    const logChannel = await resolveLogChannel(guild, config, 'role');
    if (!logChannel) return;

    const executor = await fetchExecutor(guild, AuditLogEvent.RoleDelete, {
      targetId: role.id,
    });

    const embed = createLogEmbed({
      title: '➖ Rol Eliminado',
      color: '#e74c3c',
      fields: [
        {
          name: '🏷️ Rol',
          value: `\`${role.name}\`\n🆔 \`${role.id}\``,
          inline: true,
        },
        {
          name: '🎨 Color',
          value: role.hexColor,
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
