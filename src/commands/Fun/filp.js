import { SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';

// Migrated from: commands/Fun/filp.js
export default {
    data: new SlashCommandBuilder()
    .setName("flip")
    .setDescription("Flips a coin (Heads or Tails)."),

  async execute(interaction) {
    // Generate 0 (Heads) or 1 (Tails)
    const result = Math.random() < 0.5 ? "Heads" : "Tails";
    const emoji = result === "Heads" ? "🪙" : "🔮";

    const embed = successEmbed(
      "Heads or Tails?",
      `The coin landed on... **${result}** ${emoji}!`,
    );

    await interaction.reply({ embeds: [embed] });
  },
};
