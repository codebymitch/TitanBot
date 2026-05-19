import { Events, AuditLogEvent } from 'discord.js';
import { getGuildConfig } from '../../services/guildConfigService.js';
import { isEventEnabled } from '../../services/loggingService.js';
import { resolveLogChannel } from '../../utils/logChannel.js';
import { fetchExecutor, executorText } from '../../utils/auditLog.js';
import { createLogEmbed } from '../../utils/logEmbed.js';

export default {
  name: Events.GuildMemberUpdate,

  async execute(oldMember, newMember, client) {
    const guild = oldMember.guild;
    if (!guild) return;

    const nicknameChanged = oldMember.nickname !== newMember.nickname;
    const avatarChanged = oldMember.avatar !== newMember.avatar;
    const oldTimeout = oldMember.communicationDisabledUntilTimestamp || 0;
    const newTimeout = newMember.communicationDisabledUntilTimestamp || 0;
    const timeoutChanged = oldTimeout !== newTimeout;
    const boostChanged =
      Boolean(oldMember.premiumSinceTimestamp) !== Boolean(newMember.premiumSinceTimestamp);

    if (!nicknameChanged && !avatarChanged && !timeoutChanged && !boostChanged) return;

    const config = await getGuildConfig(client.db, guild.id);

    const send = async (categoryKey, embed) => {
      const channel = await resolveLogChannel(guild, config, categoryKey);
      if (channel) await channel.send({ embeds: [embed] });
    };

    if (nicknameChanged && isEventEnabled(config, 'member.namechange')) {
      const executor = await fetchExecutor(guild, AuditLogEvent.MemberUpdate, {
        targetId: newMember.id,
      });

      await send('member', createLogEmbed({
        title: '🏷️ Apodo Cambiado',
        color: '#3498db',
        user: newMember.user,
        fields: [
          { name: '👤 Usuario', value: `${newMember.user}\n🆔 \`${newMember.id}\``, inline: false },
          { name: '📝 Antes', value: oldMember.nickname || `*(${newMember.user.username})*`, inline: true },
          { name: '📝 Después', value: newMember.nickname || `*(${newMember.user.username})*`, inline: true },
          { name: '🧑‍💼 Cambiado por', value: executorText(executor), inline: false },
        ],
        footer: `Servidor: ${guild.name}`,
      }));
    }

    if (avatarChanged && isEventEnabled(config, 'member.namechange')) {
      const newAvatarURL = newMember.avatar
        ? newMember.displayAvatarURL({ dynamic: true, size: 256 })
        : null;
      const oldAvatarURL = oldMember.avatar
        ? oldMember.displayAvatarURL({ dynamic: true, size: 256 })
        : null;

      await send('member', createLogEmbed({
        title: '🖼️ Avatar de Servidor Cambiado',
        color: '#9b59b6',
        user: newMember.user,
        thumbnail: newAvatarURL || newMember.user.displayAvatarURL({ dynamic: true }),
        fields: [
          { name: '👤 Usuario', value: `${newMember.user}\n🆔 \`${newMember.id}\``, inline: false },
          { name: '🖼️ Anterior', value: oldAvatarURL ? `[Ver](${oldAvatarURL})` : 'Avatar global', inline: true },
          { name: '🖼️ Nuevo', value: newAvatarURL ? `[Ver](${newAvatarURL})` : 'Avatar global', inline: true },
        ],
        footer: `Servidor: ${guild.name}`,
      }));
    }

    if (timeoutChanged && isEventEnabled(config, 'moderation.mute')) {
      const applied = newTimeout > Date.now();
      const executor = await fetchExecutor(guild, AuditLogEvent.MemberUpdate, {
        targetId: newMember.id,
      });

      await send('moderation', createLogEmbed({
        title: applied ? '🔇 Timeout Aplicado' : '🔊 Timeout Removido',
        color: applied ? '#F1C40F' : '#2ecc71',
        user: newMember.user,
        fields: [
          { name: '👤 Usuario', value: `${newMember.user}\n🆔 \`${newMember.id}\``, inline: false },
          ...(applied
            ? [{ name: '⏱️ Hasta', value: `<t:${Math.floor(newTimeout / 1000)}:F> (<t:${Math.floor(newTimeout / 1000)}:R>)`, inline: false }]
            : []),
          { name: '🧑‍💼 Acción por', value: executorText(executor), inline: false },
        ],
        footer: `Servidor: ${guild.name}`,
      }));
    }

    if (boostChanged && isEventEnabled(config, 'member.boost')) {
      const started = Boolean(newMember.premiumSinceTimestamp);

      await send('member', createLogEmbed({
        title: started ? '🚀 Nuevo Boost' : '💔 Boost Retirado',
        color: started ? '#f47fff' : '#e74c3c',
        user: newMember.user,
        thumbnail: newMember.user.displayAvatarURL({ dynamic: true }),
        fields: [
          { name: '👤 Usuario', value: `${newMember.user}\n🆔 \`${newMember.id}\``, inline: false },
          { name: '💎 Boosts del servidor', value: `${guild.premiumSubscriptionCount ?? 0}`, inline: true },
          { name: '🏅 Nivel', value: `${guild.premiumTier ?? 0}`, inline: true },
        ],
        footer: `Servidor: ${guild.name}`,
      }));
    }
  },
};
