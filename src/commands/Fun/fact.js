import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';

// Migrated from: commands/Fun/fact.js
// Simulated dataset of interesting facts
const facts = [
  "A day on Venus is longer than a year on Venus.",
  "The shortest war in history was between Britain and Zanzibar on August 27, 1896. It lasted 38 to 45 minutes.",
  "The word 'Strengths' is the longest word in the English language with only one vowel.",
  "Octopuses have three hearts and blue blood.",
  "There are more trees on Earth than stars in the Milky Way galaxy.",
  "The total weight of all the ants on Earth is thought to be about the same as the total weight of all humans.",
];

export default {
    data: new SlashCommandBuilder()
    .setName("fact")
    .setDescription("Shares a random, interesting fact."),

  async execute(interaction) {
    try {
      // Get a random fact from the array
      const randomFact = facts[Math.floor(Math.random() * facts.length)];

      const embed = successEmbed("🧠 Did You Know?", `💡 **${randomFact}**`);

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error("Fact command error:", error);
      await interaction.editReply({ embeds: [errorEmbed("System Error", "Could not fetch a fact right now.")] });
    }
  },
};
