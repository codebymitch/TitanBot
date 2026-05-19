import { Events, AuditLogEvent } from 'discord.js';
import { getGuildConfig } from '../../services/guildConfigService.js';
import { isEventEnabled } from '../../services/loggingService.js';
import { resolveLogChannel } from '../../utils/logChannel.js';
import { fetchExecutor, executorText } from '../../utils/auditLog.js';
import { createLogEmbed } from '../../utils/logEmbed.js';

export default {
  name: Events.GuildEmojiUpdate,

  async execute(oldEmoji, newEmoji, client) {
    const guild = newEmoji.guild;
    if (!guild) return;
    if (oldEmoji.name === newEmoji.name) return;

    const config = await getGuildConfig(client.db, guild.id);
    if (!isEventEnabled(config, 'emoji.update')) return;

    const logChannel = await resolveLogChannel(guild, config, null);
    if (!logChannel) return;

    const executor = await fetchExecutor(guild, AuditLogEvent.EmojiUpdate, {
      targetId: newEmoji.id,
    });

    const embed = createLogEmbed({
      title: '✏️ Emoji Renombrado',
      color: '#3498db',
      thumbnail: newEmoji.imageURL ? newEmoji.imageURL({ size: 128 }) : newEmoji.url,
      fields: [
        { name: '📝 Antes', value: `\`:${oldEmoji.name}:\``, inline: true },
        { name: '📝 Después', value: `\`:${newEmoji.name}:\``, inline: true },
        { name: '🧑‍💼 Editado por', value: executorText(executor), inline: false },
      ],
      footer: `Servidor: ${guild.name}`,
    });

    await logChannel.send({ embeds: [embed] });
  },
};
