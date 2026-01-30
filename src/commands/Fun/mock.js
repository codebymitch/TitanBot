import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';

// Migrated from: commands/Fun/mock.js
export default {
    data: new SlashCommandBuilder()
    .setName("mock")
    .setDescription("cOnVeRtS yOuR tExT tO sPoNgEbOb CaSe.")
    .addStringOption((option) =>
      option
        .setName("text")
        .setDescription("The text to mock.")
        .setRequired(true),
    ),

  async execute(interaction) {
    const originalText = interaction.options.getString("text");
    let mockedText = "";

    // Iterate through the string, alternating between lower and upper case
    for (let i = 0; i < originalText.length; i++) {
      const char = originalText[i];
      if (i % 2 === 0) {
        // Even index -> lower case
        mockedText += char.toLowerCase();
      } else {
        // Odd index -> upper case
        mockedText += char.toUpperCase();
      }
    }

    const embed = successEmbed("sPoNgEbOb cAsE", `"${mockedText}"`);

    await interaction.reply({ embeds: [embed] });
  },
};
