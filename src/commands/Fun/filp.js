import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';

export default {
    data: new SlashCommandBuilder()
    .setName("flip")
    .setDescription("Flips a coin (Heads or Tails)."),

  async execute(interaction) {
try {
      const result = Math.random() < 0.5 ? "Heads" : "Tails";
      const emoji = result === "Heads" ? "ðŸª™" : "ðŸ”®";

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

