import { Events } from 'discord.js';
import { getGuildConfig } from '../../services/guildConfigService.js';

export default {
  name: Events.MessageDelete,
  async execute(message) {

    if (!message.guild) return;

    const config = await getGuildConfig(
      message.client.db,
      message.guild.id
    );

    if (!config.logs?.enabled) return;

    let logChannel = null;

    // 🔥 CATEGORY (con fetch)
    if (config.logs?.categories?.message) {

      logChannel =
        message.guild.channels.cache.get(
          config.logs.categories.message
        )
        || await message.guild.channels
          .fetch(config.logs.categories.message)
          .catch(() => null);

    }

    // 🔥 FALLBACK (con fetch)
    if (!logChannel && config.logs?.channel) {

      logChannel =
        message.guild.channels.cache.get(
          config.logs.channel
        )
        || await message.guild.channels
          .fetch(config.logs.channel)
          .catch(() => null);

    }

    if (!logChannel) return;

    await logChannel.send({
      content: `🗑️ Mensaje eliminado de ${message.author}: ${message.content || 'Sin contenido'}`
    });

  }
};