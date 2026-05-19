import { Events } from 'discord.js';
import { getGuildConfig } from '../../services/guildConfigService.js';
import { isEventEnabled } from '../../services/loggingService.js';
import { resolveLogChannel } from '../../utils/logChannel.js';
import { createLogEmbed } from '../../utils/logEmbed.js';

export default {
  name: Events.GuildScheduledEventCreate,

  async execute(event, client) {
    const guild = event.guild;
    if (!guild) return;

    const config = await getGuildConfig(client.db, guild.id);
    if (!isEventEnabled(config, 'event.create')) return;

    const logChannel = await resolveLogChannel(guild, config, null);
    if (!logChannel) return;

    const embed = createLogEmbed({
      title: '📅 Evento Programado Creado',
      color: '#2ecc71',
      fields: [
        { name: '📌 Nombre', value: `\`${event.name}\``, inline: false },
        {
          name: '🕒 Inicio',
          value: event.scheduledStartTimestamp
            ? `<t:${Math.floor(event.scheduledStartTimestamp / 1000)}:F>`
            : 'Sin definir',
          inline: true,
        },
        {
          name: '👤 Creado por',
          value: event.creator ? `${event.creator.tag}` : 'Desconocido',
          inline: true,
        },
        {
          name: '📝 Descripción',
          value: event.description ? event.description.slice(0, 500) : '*Ninguna*',
          inline: false,
        },
      ],
      footer: `Servidor: ${guild.name}`,
    });

    await logChannel.send({ embeds: [embed] });
  },
};
