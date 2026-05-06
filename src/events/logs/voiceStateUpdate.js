import { Events } from 'discord.js';
import { getGuildConfig } from '../../services/guildConfigService.js';

export default {
  name: Events.VoiceStateUpdate,
  async execute(oldState, newState) {

    const guild = newState.guild;

    const config = await getGuildConfig(
      newState.client.db,
      guild.id
    );

    if (!config.logs?.enabled) return;

    let logChannel = null;

    // 🔥 CATEGORY (con fetch)
    if (config.logs?.categories?.voice) {

      logChannel =
        guild.channels.cache.get(
          config.logs.categories.voice
        )
        || await guild.channels
          .fetch(config.logs.categories.voice)
          .catch(() => null);

    }

    // 🔥 FALLBACK (con fetch)
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

    // 🔊 JOIN
    if (!oldState.channel && newState.channel) {

      await logChannel.send(
        `🔊 ${newState.member.user.tag} se unió a ${newState.channel.name}`
      );

    }

    // 🔇 LEAVE
    if (oldState.channel && !newState.channel) {

      await logChannel.send(
        `🔇 ${newState.member.user.tag} salió de ${oldState.channel.name}`
      );

    }

  }
};