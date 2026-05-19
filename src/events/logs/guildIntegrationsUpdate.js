import { Events } from 'discord.js';
import { getGuildConfig } from '../../services/guildConfigService.js';
import { isEventEnabled } from '../../services/loggingService.js';
import { resolveLogChannel } from '../../utils/logChannel.js';
import { createLogEmbed } from '../../utils/logEmbed.js';

export default {
  name: Events.GuildIntegrationsUpdate,

  async execute(guild, client) {
    if (!guild) return;

    const config = await getGuildConfig(client.db, guild.id);
    if (!isEventEnabled(config, 'integration.update')) return;

    const logChannel = await resolveLogChannel(guild, config, null);
    if (!logChannel) return;

    const embed = createLogEmbed({
      title: '🧩 Integraciones Modificadas',
      color: '#95a5a6',
      fields: [
        {
          name: 'ℹ️ Info',
          value: 'Las integraciones del servidor (bots/apps conectadas) cambiaron. Revisa Ajustes del Servidor → Integraciones para más detalle.',
          inline: false,
        },
      ],
      footer: `Servidor: ${guild.name}`,
    });

    await logChannel.send({ embeds: [embed] });
  },
};
