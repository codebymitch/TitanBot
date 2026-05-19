import { Events, AuditLogEvent } from 'discord.js';
import { getGuildConfig } from '../../services/guildConfigService.js';
import { isEventEnabled } from '../../services/loggingService.js';
import { resolveLogChannel } from '../../utils/logChannel.js';
import { fetchExecutor, executorText } from '../../utils/auditLog.js';
import { createLogEmbed } from '../../utils/logEmbed.js';

export default {
  name: Events.GuildStickerDelete,

  async execute(sticker, client) {
    const guild = sticker.guild;
    if (!guild) return;

    const config = await getGuildConfig(client.db, guild.id);
    if (!isEventEnabled(config, 'sticker.delete')) return;

    const logChannel = await resolveLogChannel(guild, config, null);
    if (!logChannel) return;

    const executor = await fetchExecutor(guild, AuditLogEvent.StickerDelete, {
      targetId: sticker.id,
    });

    const embed = createLogEmbed({
      title: '🚫 Sticker Eliminado',
      color: '#e74c3c',
      fields: [
        { name: '🏷️ Nombre', value: `\`${sticker.name}\``, inline: true },
        { name: '🆔 ID', value: `\`${sticker.id}\``, inline: true },
        { name: '🧑‍💼 Eliminado por', value: executorText(executor), inline: false },
      ],
      footer: `Servidor: ${guild.name}`,
    });

    await logChannel.send({ embeds: [embed] });
  },
};
