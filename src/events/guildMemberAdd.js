import {
  Events
} from 'discord.js';

import {
  getGuildConfig
} from '../services/guildConfigService.js';

import {
  getServerCounters,
  updateCounter
} from '../services/serverstatsService.js';

import {
  setBirthday as dbSetBirthday
} from '../utils/database.js';

import {
  logger
} from '../utils/logger.js';

import {
  t
} from '../languages/index.js';

export default {

  name: Events.GuildMemberAdd,
  once: false,

  async execute(member) {

    try {

      const { guild, user } = member;

      // =====================================
      // 🔥 CONFIG
      // =====================================

      const config = await getGuildConfig(
        member.client.db,
        guild.id
      );

      // =====================================
      // 👋 WELCOME SYSTEM
      // =====================================

      if (config.welcome?.enabled) {

        let channel = null;

        if (config.welcome?.channel) {
          channel = guild.channels.cache.get(
            config.welcome.channel
          );
        }

        if (!channel) {
          channel =
            guild.systemChannel ||
            guild.channels.cache
              .filter(c => c.isTextBased())
              .first();
        }

        if (channel) {

          try {

            let message =
              config.welcome?.message ||
              '🎉 Bienvenido {user} a {server}';

            message = message
              .replace('{user}', `${user}`)
              .replace('{server}', guild.name);

            const embed = {
              color: 0x00ffcc,
              title: `${t(config.language, 'welcome.title')} ${guild.name}`,
              description: message,
              thumbnail: {
                url: user.displayAvatarURL({ dynamic: true })
              },
              footer: {
                text:
                  config.language === 'en'
                    ? `We are now ${guild.memberCount} members`
                    : `Ahora somos ${guild.memberCount} miembros`
              },
              timestamp: new Date()
            };

            await channel.send({
              embeds: [embed]
            });

          } catch (err) {
            console.log('Error enviando welcome:', err);
          }

        }
      }

      // =====================================
      // 📊 LOG MEMBER JOIN (ADVANCED)
      // =====================================

      try {

        if (!config.logs?.enabled) return;

        let logChannel = null;

        // 🔥 MODO AVANZADO
        if (config.logs.mode === 'advanced') {

          const categoryChannel =
            config.logs.categories?.member;

          if (categoryChannel) {
            logChannel =
              guild.channels.cache.get(
                categoryChannel
              );
          }

        }

        // 🔥 MODO NORMAL (fallback)
        if (!logChannel && config.logs.channel) {

          logChannel =
            guild.channels.cache.get(
              config.logs.channel
            );

        }

        if (!logChannel) return;

        const embed = {

          color: 0x00ffcc,

          title: '👤 Member Joined',

          description: `${user} joined the server`,

          fields: [

            {
              name: 'User',
              value: `${user.tag} (${user.id})`,
              inline: true
            },

            {
              name: 'Members',
              value: guild.memberCount.toString(),
              inline: true
            },

            {
              name: 'Created',
              value: `<t:${Math.floor(user.createdTimestamp / 1000)}:R>`,
              inline: true
            }

          ],

          thumbnail: {
            url: user.displayAvatarURL({ dynamic: true })
          },

          timestamp: new Date()

        };

        await logChannel.send({
          embeds: [embed]
        });

      } catch (error) {

        logger.debug(
          'Error logging member join:',
          error
        );

      }

      // =====================================
      // 📈 CONTADORES
      // =====================================

      try {

        const counters =
          await getServerCounters(
            member.client,
            guild.id
          );

        for (const counter of counters) {

          if (
            counter &&
            counter.type &&
            counter.channelId &&
            counter.enabled !== false
          ) {

            await updateCounter(
              member.client,
              guild,
              counter
            );

          }

        }

      } catch (error) {

        logger.debug(
          'Error updating counters:',
          error
        );

      }

      // =====================================
      // 🎂 RESTAURAR CUMPLEAÑOS
      // =====================================

      try {

        const backupKey =
          `guild:${guild.id}:birthdays:left`;

        const backup =
          (await member.client.db.get(backupKey)) || {};

        if (backup[user.id]) {

          const { month, day } =
            backup[user.id];

          await dbSetBirthday(
            member.client,
            guild.id,
            user.id,
            month,
            day
          );

          delete backup[user.id];

          await member.client.db.set(
            backupKey,
            backup
          );

        }

      } catch (error) {

        logger.debug(
          'Error restoring birthday:',
          error
        );

      }

    } catch (error) {

      logger.error(
        'Error in guildMemberAdd:',
        error
      );

    }

  }

};