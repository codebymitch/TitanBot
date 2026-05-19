import { Events, AuditLogEvent } from 'discord.js';
import { getGuildConfig } from '../../services/guildConfigService.js';
import { isEventEnabled } from '../../services/loggingService.js';
import { resolveLogChannel } from '../../utils/logChannel.js';
import { fetchExecutor, executorText } from '../../utils/auditLog.js';
import { createLogEmbed } from '../../utils/logEmbed.js';

export default {
  name: Events.GuildUpdate,

  async execute(oldGuild, newGuild, client) {
    const config = await getGuildConfig(client.db, newGuild.id);
    if (!isEventEnabled(config, 'server.update')) return;

    const changes = [];

    if (oldGuild.name !== newGuild.name) {
      changes.push(`**Nombre:** \`${oldGuild.name}\` → \`${newGuild.name}\``);
    }
    if (oldGuild.ownerId !== newGuild.ownerId) {
      changes.push(`**Dueño:** <@${oldGuild.ownerId}> → <@${newGuild.ownerId}>`);
    }
    if (oldGuild.icon !== newGuild.icon) {
      changes.push('**Icono del servidor** cambiado');
    }
    if (oldGuild.banner !== newGuild.banner) {
      changes.push('**Banner** cambiado');
    }
    if (oldGuild.vanityURLCode !== newGuild.vanityURLCode) {
      changes.push(
        `**URL personalizada:** \`${oldGuild.vanityURLCode || 'ninguna'}\` → \`${newGuild.vanityURLCode || 'ninguna'}\``
      );
    }
    if (oldGuild.afkChannelId !== newGuild.afkChannelId) {
      changes.push('**Canal AFK** cambiado');
    }
    if (oldGuild.verificationLevel !== newGuild.verificationLevel) {
      changes.push(
        `**Nivel de verificación:** ${oldGuild.verificationLevel} → ${newGuild.verificationLevel}`
      );
    }

    if (changes.length === 0) return;

    const logChannel = await resolveLogChannel(newGuild, config, null);
    if (!logChannel) return;

    const executor = await fetchExecutor(newGuild, AuditLogEvent.GuildUpdate, {});

    const embed = createLogEmbed({
      title: '⚙️ Servidor Actualizado',
      color: '#f1c40f',
      thumbnail: newGuild.iconURL ? newGuild.iconURL({ dynamic: true }) : null,
      fields: [
        { name: '📝 Cambios', value: changes.join('\n'), inline: false },
        { name: '🧑‍💼 Editado por', value: executorText(executor), inline: false },
      ],
      footer: `Servidor: ${newGuild.name}`,
    });

    await logChannel.send({ embeds: [embed] });
  },
};
