import { Events } from 'discord.js';
import { getGuildConfig } from '../../services/guildConfigService.js';

export default {
  name: Events.GuildMemberUpdate,
  async execute(oldMember, newMember) {

    const guild = newMember.guild;

    const config = await getGuildConfig(
      newMember.client.db,
      guild.id
    );

    if (!config.logs?.enabled) return;

    let logChannel = null;

    // 🔥 CATEGORY (con fetch)
    if (config.logs?.categories?.role) {

      logChannel =
        guild.channels.cache.get(
          config.logs.categories.role
        )
        || await guild.channels
          .fetch(config.logs.categories.role)
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

    const added = newMember.roles.cache.filter(
      r => !oldMember.roles.cache.has(r.id)
    );

    const removed = oldMember.roles.cache.filter(
      r => !newMember.roles.cache.has(r.id)
    );

    // 🔥 SI NO HAY CAMBIOS → SALIR
    if (!added.size && !removed.size) return;

    // ➕ ROLES AÑADIDOS
    for (const role of added.values()) {

      await logChannel.send(
        `➕ ${newMember.user.tag} recibió el rol ${role.name}`
      );

    }

    // ➖ ROLES REMOVIDOS
    for (const role of removed.values()) {

      await logChannel.send(
        `➖ ${newMember.user.tag} perdió el rol ${role.name}`
      );

    }

  }
};