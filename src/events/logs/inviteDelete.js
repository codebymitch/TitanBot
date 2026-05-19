import { Events, AuditLogEvent } from 'discord.js';
import { getGuildConfig } from '../../services/guildConfigService.js';
import { isEventEnabled } from '../../services/loggingService.js';
import { resolveLogChannel } from '../../utils/logChannel.js';
import { fetchExecutor, executorText } from '../../utils/auditLog.js';
import { createLogEmbed } from '../../utils/logEmbed.js';

export default {
  name: Events.InviteDelete,

  async execute(invite, client) {
    const guild = invite.guild;
    if (!guild) return;

    const config = await getGuildConfig(client.db, guild.id);
    if (!isEventEnabled(config, 'invite.delete')) return;

    const logChannel = await resolveLogChannel(guild, config, null);
    if (!logChannel) return;

    const executor = await fetchExecutor(guild, AuditLogEvent.InviteDelete, {});

    const embed = createLogEmbed({
      title: '🔗 Invitación Eliminada',
      color: '#e74c3c',
      fields: [
        { name: '🔗 Código', value: `\`${invite.code}\``, inline: true },
        {
          name: '💬 Canal',
          value: invite.channel ? `${invite.channel}` : 'Desconocido',
          inline: true,
        },
        { name: '🧑‍💼 Eliminada por', value: executorText(executor), inline: false },
      ],
      footer: `Servidor: ${guild.name}`,
    });

    await logChannel.send({ embeds: [embed] });
  },
};
