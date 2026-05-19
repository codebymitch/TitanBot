import { Events, AuditLogEvent } from 'discord.js';
import { getGuildConfig } from '../../services/guildConfigService.js';
import { isEventEnabled } from '../../services/loggingService.js';
import { resolveLogChannel } from '../../utils/logChannel.js';
import { fetchExecutor, executorText } from '../../utils/auditLog.js';
import { createLogEmbed } from '../../utils/logEmbed.js';

export default {
  name: Events.GuildBanRemove,

  async execute(ban, client) {
    const guild = ban.guild;
    if (!guild) return;

    const config = await getGuildConfig(client.db, guild.id);
    if (!isEventEnabled(config, 'moderation.unban')) return;

    const logChannel = await resolveLogChannel(guild, config, 'moderation');
    if (!logChannel) return;

    const executor = await fetchExecutor(guild, AuditLogEvent.MemberBanRemove, {
      targetId: ban.user.id,
    });

    const embed = createLogEmbed({
      title: '♻️ Usuario Desbaneado',
      color: '#2ecc71',
      user: ban.user,
      thumbnail: ban.user.displayAvatarURL({ dynamic: true }),
      fields: [
        {
          name: '👤 Usuario',
          value: `${ban.user.tag}\n${ban.user}\n🆔 \`${ban.user.id}\``,
          inline: true,
        },
        {
          name: '🧑‍💼 Desbaneado por',
          value: executorText(executor),
          inline: true,
        },
      ],
      footer: `Servidor: ${guild.name}`,
    });

    await logChannel.send({ embeds: [embed] });
  },
};
