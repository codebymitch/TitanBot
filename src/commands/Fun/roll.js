import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';

export default {
    data: new SlashCommandBuilder()
    .setName("roll")
    .setDescription("Rolls dice using standard notation (e.g., 2d20, 1d6 + 5).")
    .addStringOption((option) =>
      option
        .setName("notation")
        .setDescription("The dice notation (e.g., 2d6, 1d20 + 4)")
        .setRequired(true),
    ),

  async execute(interaction) {
try {
      const notation = interaction.options
        .getString("notation")
        .toLowerCase()
.replace(/\s/g, "");

      const match = notation.match(/^(\d*)d(\d+)([\+\-]\d+)?$/);

      if (!match) {
        return interaction.reply({
          embeds: [
            errorEmbed("Invalid notation. Use format like `1d20` or `3d6+5`."),
          ],
        });
      }

      const numDice = parseInt(match[1] || "1", 10);
      const numSides = parseInt(match[2], 10);
      const modifier = parseInt(match[3] || "0", 10);

      if (numDice > 20 || numSides > 1000 || numSides < 1) {
        return interaction.editReply({
          embeds: [
            errorEmbed(
              "Please keep the number of dice under 20 and sides under 1000.",
            ),
          ],
        });
      }

      let rolls = [];
      let totalRoll = 0;

      for (let i = 0; i < numDice; i++) {
        const roll = Math.floor(Math.random() * numSides) + 1;
        rolls.push(roll);
        totalRoll += roll;
      }

      const finalTotal = totalRoll + modifier;

      const resultsDetail =
        numDice > 1 ? `**Rolls:** ${rolls.join(" + ")}\n` : "";
      const modifierText = modifier !== 0 ? ` + (${modifier})` : "";

      const embed = successEmbed(
        `🎲 Rolling ${numDice}d${numSides}${modifier !== 0 ? match[3] : ""}`,
        `${resultsDetail}**Total Roll:** ${totalRoll}${modifierText} = **${finalTotal}**`,
      );

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error("Roll command error:", error);
      await interaction.editReply({ embeds: [errorEmbed("System Error", "Could not roll dice right now.")] });
    }
  },
};



