import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';

// Migrated from: commands/Fun/filp.js
export default {
    data: new SlashCommandBuilder()
    .setName("flip")
    .setDescription("Flips a coin (Heads or Tails)."),

  async execute(interaction) {
try {
      // Generate 0 (Heads) or 1 (Tails)
      const result = Math.random() < 0.5 ? "Heads" : "Tails";
      const emoji = result === "Heads" ? "🪙" : "🔮";

      const embed = successEmbed(
        "Heads or Tails?",
        `The coin landed on... **${result}** ${emoji}!`,
      );

      await interaction.reply({ embeds: [embed] });
    } catch (error) {
      console.error("Flip command error:", error);
      await interaction.editReply({ embeds: [errorEmbed("System Error", "Could not flip a coin right now.")] });
    }
  },
};
