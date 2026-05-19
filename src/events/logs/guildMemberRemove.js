import { Events, AuditLogEvent } from 'discord.js';
import { getGuildConfig } from '../../services/guildConfigService.js';
import { isEventEnabled } from '../../services/loggingService.js';
import { resolveLogChannel } from '../../utils/logChannel.js';
import { fetchExecutor, executorText } from '../../utils/auditLog.js';
import { createLogEmbed } from '../../utils/logEmbed.js';

export default {
  name: Events.GuildMemberRemove,

  async execute(member, client) {
    const guild = member.guild;
    if (!guild) return;

    const config = await getGuildConfig(client.db, guild.id);

    // Distinguish a kick from a normal leave via the audit log.
    const kick = await fetchExecutor(guild, AuditLogEvent.MemberKick, {
      targetId: member.id,
      windowMs: 4000,
    });

    const isKick = Boolean(kick);
    const eventType = isKick ? 'moderation.kick' : 'member.leave';

    if (!isEventEnabled(config, eventType)) return;

    const logChannel = await resolveLogChannel(
      guild,
      config,
      isKick ? 'moderation' : 'member'
    );
    if (!logChannel) return;

    const fields = [
      {
        name: '👤 Usuario',
        value: `${member.user.tag}\n🆔 \`${member.id}\``,
        inline: true,
      },
      {
        name: '👥 Miembros',
        value: `${guild.memberCount}`,
        inline: true,
      },
    ];

    if (member.joinedTimestamp) {
      fields.push({
        name: '📅 Se unió',
        value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>`,
        inline: true,
      });
    }

    if (isKick) {
      fields.push(
        {
          name: '🧑‍💼 Expulsado por',
          value: executorText(kick),
          inline: false,
        },
        {
          name: '📝 Razón',
          value: kick?.reason || 'No especificada',
          inline: false,
        }
      );
    }

    const embed = createLogEmbed({
      title: isKick ? '👢 Usuario Expulsado (Kick)' : '👋 Miembro Salió',
      color: isKick ? '#FFA500' : '#e74c3c',
      user: member.user,
      thumbnail: member.user.displayAvatarURL({ dynamic: true }),
      fields,
      footer: `Servidor: ${guild.name}`,
    });

    await logChannel.send({ embeds: [embed] });
  },
};
