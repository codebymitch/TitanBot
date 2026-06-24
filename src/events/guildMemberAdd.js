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
            .setColor(0xFFFFFF)
            .setDescription(formattedMessage)
            .setFooter({ text: `${member.guild.name} Management` })
            .setTimestamp();

          if (welcomeConfig.welcomeImage) {
            embed.setImage(welcomeConfig.welcomeImage);
          }

          // Title line outside the embed, pinging the user
          const titleContent = `Welcome to ${member.guild.name} <@${member.id}> 🎉`;

          await welcomeChannel.send({ content: titleContent, embeds: [embed] });
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
            .setColor(0xFFFFFF)
            .setDescription(`Welcome to **${member.guild.name}**! We're glad to have you here.\n\nMake sure to check out the rules and grab your roles!`)
            .setFooter({ text: `${member.guild.name} Management` })
            .setTimestamp();

          await announcementChannel.send({
            content: `Welcome to ${member.guild.name} <@${member.id}> 🎉`,
            embeds: [embed],
          });
        }
      }

    } catch (error) {
      logger.error('Error sending welcome message:', error);
    }
  },
};