import { Events } from 'discord.js';
import { getGuildConfig } from '../../services/guildConfigService.js';

export default {
  name: Events.ChannelCreate,
  async execute(channel) {

    const guild = channel.guild;

    const config = await getGuildConfig(channel.client.db, guild.id);

    if (!config.logs?.enabled) return;

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