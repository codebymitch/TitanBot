import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';
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

      const embed = createEmbed({ title: `ðŸ‘¤ User Info: ${user.username}` })
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
    } catch (error) {
      console.error('UserInfo command error:', error);
      const errEmbed = createEmbed({ title: 'System Error', description: 'Could not retrieve user information.' });
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ embeds: [errEmbed] });
      } else {
        await interaction.reply({ embeds: [errEmbed], flags: MessageFlags.Ephemeral });
      }
      return;
    }
  },
};


