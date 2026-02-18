import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError, TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';
import { sanitizeInput } from '../../utils/sanitization.js';

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
        .setRequired(true)
        .setMaxLength(100),
    )
    .addStringOption((option) =>
      option
        .setName("name2")
        .setDescription("The second name or user.")
        .setRequired(true)
        .setMaxLength(100),
    ),
  category: 'Fun',

  async execute(interaction, config, client) {
    try {
      await interaction.deferReply();

      const name1Raw = interaction.options.getString("name1");
      const name2Raw = interaction.options.getString("name2");

      
      if (!name1Raw || name1Raw.trim().length === 0 || !name2Raw || name2Raw.trim().length === 0) {
        throw new TitanBotError(
          'Empty names provided to ship command',
          ErrorTypes.USER_INPUT,
          'Please provide valid names for both people!'
        );
      }

      
      const name1 = sanitizeInput(name1Raw.trim(), 100);
      const name2 = sanitizeInput(name2Raw.trim(), 100);

      
      if (name1.toLowerCase() === name2.toLowerCase()) {
        const embed = warningEmbed(
          "💖 Ship Score",
          `**${name1}** can't be shipped with themselves! Please choose two different people.`
        );
        return await interaction.editReply({ embeds: [embed] });
      }

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
      logger.debug(`Ship command executed by user ${interaction.user.id} in guild ${interaction.guildId}`);
    } catch (error) {
      logger.error('Ship command error:', error);
      await handleInteractionError(interaction, error, {
        commandName: 'ship',
        source: 'ship_command'
      });
    }
  },
};




