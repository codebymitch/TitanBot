import { Events, AuditLogEvent } from 'discord.js';
import { getGuildConfig } from '../../services/guildConfigService.js';
import { isEventEnabled } from '../../services/loggingService.js';
import { resolveLogChannel } from '../../utils/logChannel.js';
import { fetchExecutor, executorText } from '../../utils/auditLog.js';
import { createLogEmbed } from '../../utils/logEmbed.js';

export default {
  name: Events.GuildEmojiDelete,

  async execute(emoji, client) {
    const guild = emoji.guild;
    if (!guild) return;

    const config = await getGuildConfig(client.db, guild.id);
    if (!isEventEnabled(config, 'emoji.delete')) return;

    const logChannel = await resolveLogChannel(guild, config, null);
    if (!logChannel) return;

    const executor = await fetchExecutor(guild, AuditLogEvent.EmojiDelete, {
      targetId: emoji.id,
    });

    const embed = createLogEmbed({
      title: '🚫 Emoji Eliminado',
      color: '#e74c3c',
      fields: [
        { name: '🏷️ Nombre', value: `\`:${emoji.name}:\``, inline: true },
        { name: '🆔 ID', value: `\`${emoji.id}\``, inline: true },
        { name: '🧑‍💼 Eliminado por', value: executorText(executor), inline: false },
      ],
      footer: `Servidor: ${guild.name}`,
    });

    await logChannel.send({ embeds: [embed] });
  },
};
