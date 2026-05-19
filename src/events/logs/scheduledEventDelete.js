import { Events } from 'discord.js';
import { getGuildConfig } from '../../services/guildConfigService.js';
import { isEventEnabled } from '../../services/loggingService.js';
import { resolveLogChannel } from '../../utils/logChannel.js';
import { createLogEmbed } from '../../utils/logEmbed.js';

export default {
  name: Events.GuildScheduledEventDelete,

  async execute(event, client) {
    const guild = event.guild;
    if (!guild) return;

    const config = await getGuildConfig(client.db, guild.id);
    if (!isEventEnabled(config, 'event.delete')) return;

    const logChannel = await resolveLogChannel(guild, config, null);
    if (!logChannel) return;

    const embed = createLogEmbed({
      title: '🗑️ Evento Programado Eliminado',
      color: '#e74c3c',
      fields: [
        { name: '📌 Nombre', value: `\`${event.name}\``, inline: false },
        {
          name: '🕒 Estaba programado',
          value: event.scheduledStartTimestamp
            ? `<t:${Math.floor(event.scheduledStartTimestamp / 1000)}:F>`
            : 'Sin definir',
          inline: true,
        },
      ],
      footer: `Servidor: ${guild.name}`,
    });

    await logChannel.send({ embeds: [embed] });
  },
};
