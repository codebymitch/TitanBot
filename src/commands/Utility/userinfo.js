import { SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';

// Migrated from: commands/Utility/userinfo.js
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
    const user = interaction.options.getUser("target") || interaction.user;
    const member = interaction.guild.members.cache.get(user.id);

    // Calculate account creation time
    const createdTimestamp = Math.floor(user.createdAt.getTime() / 1000);
    const joinedTimestamp = Math.floor(member.joinedAt.getTime() / 1000);

    const embed = createEmbed(`👤 User Info: ${user.username}`, null)
      .setThumbnail(user.displayAvatarURL({ size: 256 }))
      .addFields(
        { name: "ID", value: user.id, inline: true },
        { name: "Bot", value: user.bot ? "Yes" : "No", inline: true },
        {
          name: "Roles",
          value:
            member.roles.cache.size > 1
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
          value: `<t:${joinedTimestamp}:R>`,
          inline: false,
        },
        {
          name: "Highest Role",
          value: member.roles.highest.name,
          inline: true,
        },
      );

    await interaction.reply({ embeds: [embed] });
  },
};
