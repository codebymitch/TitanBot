import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';

// Migrated from: commands/Fun/reverse.js
export default {
    data: new SlashCommandBuilder()
    .setName("reverse")
    .setDescription("Writes your text backwards.")
    .addStringOption((option) =>
      option
        .setName("text")
        .setDescription("The text to reverse.")
        .setRequired(true),
    ),

  async execute(interaction) {
try {
      const originalText = interaction.options.getString("text");

      // Split the string into an array of characters, reverse the array, and join it back
      const reversedText = originalText.split("").reverse().join("");

      const embed = successEmbed(
        "Backwards Text",
        `Original: **${originalText}**\nReversed: **${reversedText}**`,
      );

      await interaction.reply({ embeds: [embed] });
    } catch (error) {
      console.error("Reverse command error:", error);
      await interaction.editReply({ embeds: [errorEmbed("System Error", "Could not reverse text right now.")] });
    }
  },
};
