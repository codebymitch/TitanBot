import { Events, EmbedBuilder } from 'discord.js';
import { logger } from '../utils/logger.js';
import { getFromDb, getWelcomeConfig } from '../utils/database.js';
import { formatWelcomeMessage } from '../utils/welcome.js';

const ANNOUNCEMENT_KEY = (guildId) => `announcement_config_${guildId}`;

export default {
  name: Events.GuildMemberAdd,
  async execute(member, client) {
    try {
      // --- Primary welcome system (set via /welcome setup) ---
      const welcomeConfig = await getWelcomeConfig(client, member.guild.id).catch(() => null);

      if (welcomeConfig?.enabled && welcomeConfig?.channelId) {
        const welcomeChannel = member.guild.channels.cache.get(welcomeConfig.channelId)
          || await member.guild.channels.fetch(welcomeConfig.channelId).catch(() => null);

        if (welcomeChannel) {
          const formattedMessage = formatWelcomeMessage(welcomeConfig.welcomeMessage || 'Welcome {user}!', {
            user: member.user,
            guild: member.guild,
          });

          const embed = new EmbedBuilder()
            .setColor(0x2ECC71)
            .setDescription(formattedMessage)
            .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }))
            .addFields(
              { name: 'Member', value: `<@${member.id}>`, inline: true },
              { name: 'Account Created', value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, inline: true },
              { name: 'Member Count', value: `#${member.guild.memberCount}`, inline: true },
            )
            .setTimestamp();

          if (welcomeConfig.welcomeImage) {
            embed.setImage(welcomeConfig.welcomeImage);
          }

          const pingContent = welcomeConfig.welcomePing ? `<@${member.id}>` : undefined;
          await welcomeChannel.send({ content: pingContent, embeds: [embed] });
          logger.info(`Welcome message sent for ${member.user.tag} in ${member.guild.name}`);
        }
      }

      // --- Announcement system welcome (set via /announcement setchannel welcome) ---
      const announcementConfig = await getFromDb(ANNOUNCEMENT_KEY(member.guild.id), {});
      if (announcementConfig?.welcomeChannelId && announcementConfig.welcomeChannelId !== welcomeConfig?.channelId) {
        const announcementChannel = member.guild.channels.cache.get(announcementConfig.welcomeChannelId)
          || await member.guild.channels.fetch(announcementConfig.welcomeChannelId).catch(() => null);

        if (announcementChannel) {
          const embed = new EmbedBuilder()
            .setColor(0x2ECC71)
            .setTitle(`👋 Welcome to ${member.guild.name}!`)
            .setDescription(`Hey <@${member.id}>, welcome to **${member.guild.name}**! We're glad to have you here.\n\nMake sure to check out the rules and grab your roles!`)
            .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }))
            .addFields(
              { name: 'Member', value: `<@${member.id}>`, inline: true },
              { name: 'Account Created', value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, inline: true },
              { name: 'Member Count', value: `#${member.guild.memberCount}`, inline: true },
            )
            .setTimestamp();

          await announcementChannel.send({ embeds: [embed] });
        }
      }

    } catch (error) {
      logger.error('Error sending welcome message:', error);
    }
  },
};