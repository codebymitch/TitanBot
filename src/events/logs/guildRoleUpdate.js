import { Events, AuditLogEvent } from 'discord.js';
import { getGuildConfig } from '../../services/guildConfigService.js';
import { isEventEnabled } from '../../services/loggingService.js';
import { resolveLogChannel } from '../../utils/logChannel.js';
import { fetchExecutor, executorText } from '../../utils/auditLog.js';
import { createLogEmbed } from '../../utils/logEmbed.js';

export default {
  name: Events.GuildRoleUpdate,

  async execute(oldRole, newRole, client) {
    const guild = newRole.guild;
    if (!guild) return;

    const config = await getGuildConfig(client.db, guild.id);
    if (!isEventEnabled(config, 'role.update')) return;

    const changes = [];

    if (oldRole.name !== newRole.name) {
      changes.push(`**Nombre:** \`${oldRole.name}\` → \`${newRole.name}\``);
    }
    if (oldRole.hexColor !== newRole.hexColor) {
      changes.push(`**Color:** ${oldRole.hexColor} → ${newRole.hexColor}`);
    }
    if (oldRole.hoist !== newRole.hoist) {
      changes.push(`**Mostrar separado:** ${oldRole.hoist ? 'Sí' : 'No'} → ${newRole.hoist ? 'Sí' : 'No'}`);
    }
    if (oldRole.mentionable !== newRole.mentionable) {
      changes.push(
        `**Mencionable:** ${oldRole.mentionable ? 'Sí' : 'No'} → ${newRole.mentionable ? 'Sí' : 'No'}`
      );
    }

    const oldPerms = oldRole.permissions.toArray();
    const newPerms = newRole.permissions.toArray();
    const added = newPerms.filter((p) => !oldPerms.includes(p));
    const removed = oldPerms.filter((p) => !newPerms.includes(p));

    if (added.length) {
      changes.push(`**Permisos +:** ${added.join(', ').slice(0, 500)}`);
    }
    if (removed.length) {
      changes.push(`**Permisos -:** ${removed.join(', ').slice(0, 500)}`);
    }

    if (changes.length === 0) return;

    const logChannel = await resolveLogChannel(guild, config, 'role');
    if (!logChannel) return;

    const executor = await fetchExecutor(guild, AuditLogEvent.RoleUpdate, {
      targetId: newRole.id,
    });

    const embed = createLogEmbed({
      title: '🔄 Rol Editado',
      color: '#3498db',
      fields: [
        {
          name: '🏷️ Rol',
          value: `${newRole}\n🆔 \`${newRole.id}\``,
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
