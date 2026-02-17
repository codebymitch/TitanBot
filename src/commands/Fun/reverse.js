import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError, TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';
import { sanitizeInput } from '../../utils/sanitization.js';

export default {
    data: new SlashCommandBuilder()
    .setName("reverse")
    .setDescription("Writes your text backwards.")
    .addStringOption((option) =>
      option
        .setName("text")
        .setDescription("The text to reverse.")
        .setRequired(true)
        .setMaxLength(1000),
    ),
  category: 'Fun',

  async execute(interaction, config, client) {
    try {
      const originalText = interaction.options.getString("text");
      
      // Validate input length
      if (!originalText || originalText.trim().length === 0) {
        throw new TitanBotError(
          'Empty text provided to reverse command',
          ErrorTypes.USER_INPUT,
          'Please provide some text to reverse!'
        );
      }

      // Sanitize input to prevent injection
      const sanitizedText = sanitizeInput(originalText, 1000);
      const reversedText = sanitizedText.split("").reverse().join("");

      const embed = successEmbed(
        "Backwards Text",
        `Original: **${sanitizedText}**\nReversed: **${reversedText}**`,
      );

      await interaction.reply({ embeds: [embed] });
      logger.debug(`Reverse command executed by user ${interaction.user.id} in guild ${interaction.guildId}`);
    } catch (error) {
      logger.error('Reverse command error:', error);
      await handleInteractionError(interaction, error, {
        commandName: 'reverse',
        source: 'reverse_command'
      });
    }
  },
};


