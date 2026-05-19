import { Events } from 'discord.js';
import { getGuildConfig } from '../../services/guildConfigService.js';
import { isEventEnabled } from '../../services/loggingService.js';
import { resolveLogChannel } from '../../utils/logChannel.js';
import { createLogEmbed } from '../../utils/logEmbed.js';

const STATUS_NAMES = { 1: 'Programado', 2: 'Activo', 3: 'Finalizado', 4: 'Cancelado' };

export default {
  name: Events.GuildScheduledEventUpdate,

  async execute(oldEvent, newEvent, client) {
    const guild = newEvent.guild;
    if (!guild) return;

    const config = await getGuildConfig(client.db, guild.id);
    if (!isEventEnabled(config, 'event.update')) return;

    const changes = [];

    if (oldEvent?.name !== newEvent.name) {
      changes.push(`**Nombre:** \`${oldEvent?.name}\` → \`${newEvent.name}\``);
    }
    if (oldEvent?.status !== newEvent.status) {
      changes.push(
        `**Estado:** ${STATUS_NAMES[oldEvent?.status] || oldEvent?.status} → ${STATUS_NAMES[newEvent.status] || newEvent.status}`
      );
    }
    if (oldEvent?.scheduledStartTimestamp !== newEvent.scheduledStartTimestamp) {
      changes.push(
        `**Inicio:** <t:${Math.floor((oldEvent?.scheduledStartTimestamp || 0) / 1000)}:f> → <t:${Math.floor((newEvent.scheduledStartTimestamp || 0) / 1000)}:f>`
      );
    }
    if ((oldEvent?.description || '') !== (newEvent.description || '')) {
      changes.push('**Descripción** modificada');
    }

    if (changes.length === 0) return;

    const logChannel = await resolveLogChannel(guild, config, null);
    if (!logChannel) return;

    const embed = createLogEmbed({
      title: '✏️ Evento Programado Editado',
      color: '#3498db',
      fields: [
        { name: '📌 Evento', value: `\`${newEvent.name}\``, inline: false },
        { name: '📝 Cambios', value: changes.join('\n'), inline: false },
      ],
      footer: `Servidor: ${guild.name}`,
    });

    await logChannel.send({ embeds: [embed] });
  },
};
