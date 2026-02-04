import { SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';

// Migrated from: commands/Fun/wanted.js
export default {
    data: new SlashCommandBuilder()
    .setName("wanted")
    .setDescription("Create a WANTED poster for a user.")
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("The user who is wanted.")
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("crime")
        .setDescription("The crime they committed.")
        .setRequired(false)
        .setMaxLength(100),
    ),
  async execute(interaction) {
    try {
      const targetUser = interaction.options.getUser("user");
      const crime =
        interaction.options.getString("crime") || "Too adorable for this server.";

      // Calculate a random bounty between $1,000,000 and $100,000,000
      const bountyAmount = Math.floor(
        Math.random() * (100000000 - 1000000) + 1000000,
      );
      const bounty = `$${bountyAmount.toLocaleString()} USD`;

      const embed = {
        color: 0x964b00, // Brown, like old paper
        title: `💥 𝐁𝐈𝐆 𝐁𝐎𝐔𝐍𝐓𝐘: WANTED! 💥`,
        description: `**CRIMINAL:** ${targetUser.tag}\n**CRIME:** ${crime}`,
        fields: [
          {
            name: "DEAD OR ALIVE",
            value: `**BOUNTY:** ${bounty}`,
            inline: false,
          },
        ],
        image: {
          url: targetUser.displayAvatarURL({ size: 1024, format: "png" }),
        },
        footer: {
          text: `Last seen in ${interaction.guild.name}`,
        },
      };

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error("Wanted command error:", error);
      await interaction.editReply({ embeds: [createEmbed({ title: "System Error", description: "Could not create wanted poster." })] });
    }
  },
};
