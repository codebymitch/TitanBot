import { Events } from 'discord.js';
import { getGuildConfig } from '../services/guildConfigService.js';
import { logEvent, EVENT_TYPES } from '../services/loggingService.js';
import { getServerCounters, updateCounter } from '../services/serverstatsService.js';
import { setBirthday as dbSetBirthday } from '../utils/database.js';
import { logger } from '../utils/logger.js';

export default {
  name: Events.GuildMemberAdd,
  once: false,
  
  async execute(member) {
    try {
      const { guild, user } = member;

      // 🔥 CONFIG DESDE DASHBOARD
      const config = await getGuildConfig(member.client.db, guild.id);

      // 🔥 SISTEMA DE BIENVENIDA
      if (config.welcome_enabled) {

        let channel = null;

        // 👉 Canal seleccionado
        if (config.welcome_channel) {
          channel = guild.channels.cache.get(config.welcome_channel);
        }

        // 👉 fallback si no hay canal
        if (!channel) {
          channel = guild.systemChannel || guild.channels.cache
            .filter(c => c.isTextBased())
            .first();
        }

        // 👉 MENSAJE + EMBED
        if (channel) {
          try {

            let message = config.welcome_message || "🎉 Bienvenido {user} a {server}";

            message = message
              .replace('{user}', `${user}`)
              .replace('{server}', guild.name);

            const embed = {
              color: 0x00ffcc,
              title: `👋 Bienvenido a ${guild.name}`,
              description: message,
              thumbnail: {
                url: user.displayAvatarURL({ dynamic: true })
              },
              footer: {
                text: `Ahora somos ${guild.memberCount} miembros`
              },
              timestamp: new Date()
            };

            await channel.send({ embeds: [embed] });

          } catch (err) {
            console.log("Error enviando welcome:", err);
          }
        }
      }

      // 🔥 LOG DE ENTRADA
      try {
        await logEvent({
          client: member.client,
          guildId: guild.id,
          eventType: EVENT_TYPES.MEMBER_JOIN,
          data: {
            description: `${user.tag} joined the server`,
            userId: user.id,
            fields: [
              {
                name: '👤 Member',
                value: `${user.tag} (${user.id})`,
                inline: true
              },
              {
                name: '👥 Member Count',
                value: guild.memberCount.toString(),
                inline: true
              },
              {
                name: '📅 Account Created',
                value: `<t:${Math.floor(user.createdTimestamp / 1000)}:R>`,
                inline: true
              }
            ]
          }
        });
      } catch (error) {
        logger.debug('Error logging member join:', error);
      }

      // 🔥 CONTADORES
      try {
        const counters = await getServerCounters(member.client, guild.id);
        for (const counter of counters) {
          if (counter && counter.type && counter.channelId && counter.enabled !== false) {
            await updateCounter(member.client, guild, counter);
          }
        }
      } catch (error) {
        logger.debug('Error updating counters on member join:', error);
      }

      // 🔥 RESTAURAR CUMPLEAÑOS
      try {
        const backupKey = `guild:${guild.id}:birthdays:left`;
        const backup = (await member.client.db.get(backupKey)) || {};

        if (backup[user.id]) {
          const { month, day } = backup[user.id];
          await dbSetBirthday(member.client, guild.id, user.id, month, day);

          delete backup[user.id];
          await member.client.db.set(backupKey, backup);

          logger.debug(`Birthday restored for user ${user.id} in guild ${guild.id}`);
        }
      } catch (error) {
        logger.debug('Error restoring birthday on member join:', error);
      }

    } catch (error) {
      logger.error('Error in guildMemberAdd event:', error);
    }
  }
};
