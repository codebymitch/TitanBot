import { Events, AuditLogEvent } from 'discord.js';
import { getGuildConfig } from '../../services/guildConfigService.js';
import { isEventEnabled } from '../../services/loggingService.js';
import { resolveLogChannel } from '../../utils/logChannel.js';
import { fetchExecutor, executorText } from '../../utils/auditLog.js';
import { createLogEmbed } from '../../utils/logEmbed.js';

export default {
  name: Events.GuildStickerCreate,

  async execute(sticker, client) {
    const guild = sticker.guild;
    if (!guild) return;

    const config = await getGuildConfig(client.db, guild.id);
    if (!isEventEnabled(config, 'sticker.create')) return;

    const logChannel = await resolveLogChannel(guild, config, null);
    if (!logChannel) return;

    const executor = await fetchExecutor(guild, AuditLogEvent.StickerCreate, {
      targetId: sticker.id,
    });

    const embed = createLogEmbed({
      title: '🏷️ Sticker Creado',
      color: '#2ecc71',
      fields: [
        { name: '🏷️ Nombre', value: `\`${sticker.name}\``, inline: true },
        { name: '🆔 ID', value: `\`${sticker.id}\``, inline: true },
        { name: '📝 Descripción', value: sticker.description || '*Ninguna*', inline: false },
        { name: '🧑‍💼 Creado por', value: executorText(executor), inline: false },
      ],
      footer: `Servidor: ${guild.name}`,
    });

    await logChannel.send({ embeds: [embed] });
  },
};
