import { SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';

// Migrated from: commands/Economy/ebalance.js
export default {
    data: new SlashCommandBuilder()
    .setName("ebalance")
    .setDescription("Check your current cash and bank balance.")
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("The user whose balance you want to check.")
        .setRequired(false),
    )
    .setDMPermission(false),
  category: "Economy",

  async execute(interaction, config, client) {
    await interaction.deferReply();

    const targetUser = interaction.options.getUser("user") || interaction.user;
    const guildId = interaction.guildId;

    if (targetUser.bot) {
      return interaction.editReply({
        embeds: [
          errorEmbed(
            "Balance Check Failed",
            "Bots don't have an economy balance.",
          ),
        ],
      });
    }

    try {
      const userData = await getEconomyData(client, guildId, targetUser.id);
      const maxBank = getMaxBankCapacity(userData); // Get Max Capacity

      const embed = createEmbed(
        `💰 ${targetUser.username}'s Balance`,
        `Here is the current financial status for ${targetUser.username}.`,
      )
        .addFields(
          {
            name: "💵 Cash",
            value: `$${userData.cash.toLocaleString()}`,
            inline: true,
          },
          {
            name: "🏦 Bank",
            // Display current bank balance out of max capacity
            value: `$${userData.bank.toLocaleString()} / $${maxBank.toLocaleString()}`,
            inline: true,
          },
          {
            name: "📊 Net Worth",
            value: `$${(userData.cash + userData.bank).toLocaleString()}`,
            inline: true,
          },
        )
        .setThumbnail(targetUser.displayAvatarURL());

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error("Balance command error:", error);
      await interaction.editReply({
        embeds: [errorEmbed("System Error", "Could not fetch economy data.")],
      });
    }
  },
};
