import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
export default {
    data: new SlashCommandBuilder()
    .setName("userinfo")
    .setDescription("Get detailed information about a user")
    .addUserOption((option) =>
      option
        .setName("target")
        .setDescription("The user to inspect (defaults to you)"),
    ),

  async execute(interaction) {
    try {
      const user = interaction.options.getUser("target") || interaction.user;
      const member = interaction.guild.members.cache.get(user.id);

      const createdTimestamp = Math.floor(user.createdAt.getTime() / 1000);
      const joinedTimestamp = member?.joinedAt ? Math.floor(member.joinedAt.getTime() / 1000) : null;

      const embed = createEmbed({ title: `👤 User Info: ${user.username}` })
        .setThumbnail(user.displayAvatarURL({ size: 256 }))
        .addFields(
          { name: "ID", value: user.id, inline: true },
          { name: "Bot", value: user.bot ? "Yes" : "No", inline: true },
          {
            name: "Roles",
            value:
              member && member.roles.cache.size > 1
                ? member.roles.cache
                    .map((r) => r.name)
                    .slice(0, 5)
                    .join(", ")
                : "None",
            inline: true,
          },
          {
            name: "Account Created",
            value: `<t:${createdTimestamp}:R>`,
            inline: false,
          },
          {
            name: "Joined Server",
            value: joinedTimestamp ? `<t:${joinedTimestamp}:R>` : "Not in server",
            inline: false,
          },
          {
            name: "Highest Role",
            value: member?.roles?.highest?.name || "None",
            inline: true,
          },
        );

      await interaction.editReply({ embeds: [embed] });
      logger.info(`UserInfo command executed`, {
        userId: interaction.user.id,
        targetUserId: user.id,
        guildId: interaction.guildId
      });
    } catch (error) {
      logger.error(`UserInfo command execution failed`, {
        error: error.message,
        stack: error.stack,
        userId: interaction.user.id,
        guildId: interaction.guildId,
        commandName: 'userinfo'
      });
      await handleInteractionError(interaction, error, {
        commandName: 'userinfo',
        source: 'userinfo_command'
      });
    }
  },
};




