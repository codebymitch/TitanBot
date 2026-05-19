import { Events } from 'discord.js';
import { getGuildConfig } from '../../services/guildConfigService.js';
import { isEventEnabled } from '../../services/loggingService.js';

export default {
  name: Events.GuildBanAdd,
  async execute(ban) {

    const guild = ban.guild;

    const config = await getGuildConfig(
      ban.client.db,
      guild.id
    );

    if (!isEventEnabled(config, 'moderation.ban')) return;

    let logChannel = null;

    // 🔥 CATEGORY (con fetch)
    if (config.logs?.categories?.moderation) {

      logChannel =
        guild.channels.cache.get(
          config.logs.categories.moderation
        )
        || await guild.channels
          .fetch(config.logs.categories.moderation)
          .catch(() => null);

    }

    // 🔥 FALLBACK
    if (!logChannel && config.logs?.channel) {

      logChannel =
        guild.channels.cache.get(
          config.logs.channel
        )
        || await guild.channels
          .fetch(config.logs.channel)
          .catch(() => null);

    }

    if (!logChannel) return;

    await logChannel.send(
      `🔨 Usuario baneado: ${ban.user.tag}`
    );

  }
};