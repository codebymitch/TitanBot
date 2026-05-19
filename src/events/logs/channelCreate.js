import { Events } from 'discord.js';
import { getGuildConfig } from '../../services/guildConfigService.js';
import { isEventEnabled } from '../../services/loggingService.js';

export default {
  name: Events.ChannelCreate,
  async execute(channel) {

    const guild = channel.guild;

    const config = await getGuildConfig(channel.client.db, guild.id);

    if (!isEventEnabled(config, 'channel.create')) return;

    let logChannel = null;

    if (config.logs?.categories?.channel) {
      logChannel = guild.channels.cache.get(config.logs.categories.channel);
    }

    if (!logChannel && config.logs?.channel) {
      logChannel = guild.channels.cache.get(config.logs.channel);
    }

    if (!logChannel) return;

    logChannel.send(`📁 Canal creado: ${channel.name}`);

  }
};