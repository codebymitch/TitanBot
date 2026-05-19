import { Events } from 'discord.js';
import { getGuildConfig } from '../../services/guildConfigService.js';
import { isEventEnabled } from '../../services/loggingService.js';
import { createLogEmbed } from '../../utils/logEmbed.js';

export default {
  name: Events.UserUpdate,

  async execute(oldUser, newUser, client) {
    const avatarChanged = oldUser.avatar !== newUser.avatar;
    const usernameChanged = oldUser.username !== newUser.username;
    const displayNameChanged = oldUser.globalName !== newUser.globalName;

    if (!avatarChanged && !usernameChanged && !displayNameChanged) return;

    const guilds = client.guilds.cache.filter(guild =>
      guild.members.cache.has(newUser.id)
    );

    for (const [, guild] of guilds) {
      try {
        const config = await getGuildConfig(client.db, guild.id);
        if (!isEventEnabled(config, 'member.namechange')) continue;

        let logChannel = null;

        if (config.logs?.categories?.member) {
          logChannel =
            guild.channels.cache.get(config.logs.categories.member) ||
            await guild.channels.fetch(config.logs.categories.member).catch(() => null);
        }

        if (!logChannel && config.logs?.channel) {
          logChannel =
            guild.channels.cache.get(config.logs.channel) ||
            await guild.channels.fetch(config.logs.channel).catch(() => null);
        }

        if (!logChannel) continue;

        const fields = [
          {
            name: '👤 Usuario',
            value: `${newUser}\n🆔 \`${newUser.id}\``,
            inline: false,
          },
        ];

        if (usernameChanged) {
          fields.push(
            { name: '📝 Username anterior', value: oldUser.username, inline: true },
            { name: '📝 Username nuevo', value: newUser.username, inline: true }
          );
        }

        if (displayNameChanged) {
          fields.push(
            {
              name: '📛 Display Name anterior',
              value: oldUser.globalName || '*(ninguno)*',
              inline: true,
            },
            {
              name: '📛 Display Name nuevo',
              value: newUser.globalName || '*(ninguno)*',
              inline: true,
            }
          );
        }

        if (avatarChanged) {
          fields.push({
            name: '🖼️ Avatar',
            value: `[Ver nuevo avatar](${newUser.displayAvatarURL({ dynamic: true, size: 256 })})`,
            inline: false,
          });
        }

        const title = usernameChanged
          ? '📝 Username Changed'
          : displayNameChanged
            ? '📛 Display Name Changed'
            : '🖼️ Avatar Updated';

        const embed = createLogEmbed({
          title,
          color: '#e67e22',
          user: newUser,
          thumbnail: avatarChanged
            ? newUser.displayAvatarURL({ dynamic: true, size: 256 })
            : null,
          fields,
          footer: `Servidor: ${guild.name}`,
        });

        await logChannel.send({ embeds: [embed] });
      } catch {
        // skip this guild if anything fails
      }
    }
  },
};
