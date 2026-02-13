import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';

function stringToHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
hash |= 0;
  }
  return Math.abs(hash);
}

export default {
    data: new SlashCommandBuilder()
    .setName("ship")
    .setDescription("Calculate the compatibility score between two people.")
    .addStringOption((option) =>
      option
        .setName("name1")
        .setDescription("The first name or user.")
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("name2")
        .setDescription("The second name or user.")
        .setRequired(true),
    ),

  async execute(interaction) {
try {
      const name1 = interaction.options.getString("name1").trim();
      const name2 = interaction.options.getString("name2").trim();

      const sortedNames = [name1, name2].sort();

      const combination = sortedNames.join("-").toLowerCase();

const score = stringToHash(combination) % 101;

      let description;
      if (score === 100) {
        description = "Soulmates! It's destiny, they belong together!";
      } else if (score >= 80) {
        description = "A perfect match! Get the wedding bells ready!";
      } else if (score >= 60) {
        description = "Solid chemistry. Definitely worth exploring!";
      } else if (score >= 40) {
        description = "Just friends status. Maybe with time?";
      } else if (score >= 20) {
        description = "It's a struggle. They might need space.";
      } else {
        description = "Zero compatibility. Run for the hills!";
      }

      const progressBar =
        "█".repeat(Math.floor(score / 10)) +
        "░".repeat(10 - Math.floor(score / 10));

      const embed = successEmbed(
        `💖 Ship Score: ${name1} vs ${name2}`,
        `Compatibility: **${score}%**\n\n\`${progressBar}\`\n\n*${description}*`,
      );

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error("Ship command error:", error);
      await interaction.editReply({ embeds: [errorEmbed("System Error", "Could not calculate compatibility right now.")] });
    }
  },
};




