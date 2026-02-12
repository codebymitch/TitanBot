import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';

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
try {
      const originalText = interaction.options.getString("text");
      let mockedText = "";

      for (let i = 0; i < originalText.length; i++) {
        const char = originalText[i];
        if (i % 2 === 0) {
          mockedText += char.toLowerCase();
        } else {
          mockedText += char.toUpperCase();
        }
      }

      const embed = successEmbed("sPoNgEbOb cAsE", `"${mockedText}"`);

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error("Mock command error:", error);
      await interaction.editReply({ embeds: [errorEmbed("System Error", "Could not mock text right now.")] });
    }
  },
};

