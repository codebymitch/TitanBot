import { Events, AuditLogEvent } from 'discord.js';
import { getGuildConfig } from '../../services/guildConfigService.js';
import { isEventEnabled } from '../../services/loggingService.js';
import { resolveLogChannel } from '../../utils/logChannel.js';
import { fetchExecutor, executorText } from '../../utils/auditLog.js';
import { createLogEmbed } from '../../utils/logEmbed.js';

export default {
  name: Events.GuildEmojiCreate,

  async execute(emoji, client) {
    const guild = emoji.guild;
    if (!guild) return;

    const config = await getGuildConfig(client.db, guild.id);
    if (!isEventEnabled(config, 'emoji.create')) return;

    const logChannel = await resolveLogChannel(guild, config, null);
    if (!logChannel) return;

    const executor = await fetchExecutor(guild, AuditLogEvent.EmojiCreate, {
      targetId: emoji.id,
    });

    const embed = createLogEmbed({
      title: '😀 Emoji Creado',
      color: '#2ecc71',
      thumbnail: emoji.imageURL ? emoji.imageURL({ size: 128 }) : emoji.url,
      fields: [
        { name: '🏷️ Nombre', value: `\`:${emoji.name}:\``, inline: true },
        { name: '🆔 ID', value: `\`${emoji.id}\``, inline: true },
        { name: '🧑‍💼 Creado por', value: executorText(executor), inline: false },
      ],
      footer: `Servidor: ${guild.name}`,
    });

    await logChannel.send({ embeds: [embed] });
  },
};
