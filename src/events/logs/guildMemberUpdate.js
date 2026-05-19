import { Events, AuditLogEvent } from 'discord.js';
import { getGuildConfig } from '../../services/guildConfigService.js';
import { isEventEnabled } from '../../services/loggingService.js';
import { createLogEmbed } from '../../utils/logEmbed.js';

export default {
  name: Events.GuildMemberUpdate,

  async execute(oldMember, newMember, client) {
    if (!oldMember.guild) return;

    const nicknameChanged = oldMember.nickname !== newMember.nickname;
    const avatarChanged = oldMember.avatar !== newMember.avatar;

    if (!nicknameChanged && !avatarChanged) return;

    const config = await getGuildConfig(client.db, oldMember.guild.id);
    if (!isEventEnabled(config, 'member.namechange')) return;

    let logChannel = null;

    if (config.logs?.categories?.member) {
      logChannel =
        oldMember.guild.channels.cache.get(config.logs.categories.member) ||
        await oldMember.guild.channels.fetch(config.logs.categories.member).catch(() => null);
    }

    if (!logChannel && config.logs?.channel) {
      logChannel =
        oldMember.guild.channels.cache.get(config.logs.channel) ||
        await oldMember.guild.channels.fetch(config.logs.channel).catch(() => null);
    }

    if (!logChannel) return;

    if (nicknameChanged) {
      let executor = 'Desconocido';

      try {
        await new Promise(res => setTimeout(res, 500));
        const fetchedLogs = await oldMember.guild.fetchAuditLogs({
          limit: 5,
          type: AuditLogEvent.MemberUpdate,
        });
        const log = fetchedLogs.entries.find(
          entry =>
            entry.target?.id === newMember.id &&
            Date.now() - entry.createdTimestamp < 5000
        );
        if (log) executor = `${log.executor.tag} (${log.executor.id})`;
      } catch {
        // audit logs not available
      }

      const embed = createLogEmbed({
        title: '🏷️ Nickname Changed',
        color: '#3498db',
        user: newMember.user,
        fields: [
          {
            name: '👤 Usuario',
            value: `${newMember.user}\n🆔 \`${newMember.id}\``,
            inline: false,
          },
          {
            name: '📝 Antes',
            value: oldMember.nickname || `*(${newMember.user.username})*`,
            inline: true,
          },
          {
            name: '📝 Después',
            value: newMember.nickname || `*(${newMember.user.username})*`,
            inline: true,
          },
          {
            name: '🧑‍💼 Cambiado por',
            value: executor === 'Desconocido' ? 'No se pudo determinar' : executor,
            inline: false,
          },
        ],
        footer: `Servidor: ${newMember.guild.name}`,
      });

      await logChannel.send({ embeds: [embed] });
    }

    if (avatarChanged) {
      const newAvatarURL = newMember.avatar
        ? newMember.displayAvatarURL({ dynamic: true, size: 256 })
        : null;
      const oldAvatarURL = oldMember.avatar
        ? oldMember.displayAvatarURL({ dynamic: true, size: 256 })
        : null;

      const embed = createLogEmbed({
        title: '🖼️ Server Avatar Changed',
        color: '#9b59b6',
        user: newMember.user,
        thumbnail: newAvatarURL || newMember.user.displayAvatarURL({ dynamic: true }),
        fields: [
          {
            name: '👤 Usuario',
            value: `${newMember.user}\n🆔 \`${newMember.id}\``,
            inline: false,
          },
          {
            name: '🖼️ Avatar anterior',
            value: oldAvatarURL ? `[Ver avatar](${oldAvatarURL})` : 'Avatar global',
            inline: true,
          },
          {
            name: '🖼️ Avatar nuevo',
            value: newAvatarURL ? `[Ver avatar](${newAvatarURL})` : 'Avatar global',
            inline: true,
          },
        ],
        footer: `Servidor: ${newMember.guild.name}`,
      });

      await logChannel.send({ embeds: [embed] });
    }
  },
};
