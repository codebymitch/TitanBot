import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError, TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
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
  category: 'Fun',

  async execute(interaction, config, client) {
    try {
      const randomFact = facts[Math.floor(Math.random() * facts.length)];

      const embed = successEmbed("🧠 Did You Know?", `💡 **${randomFact}**`);

      await InteractionHelper.safeReply(interaction, { embeds: [embed] });
      logger.debug(`Fact command executed by user ${interaction.user.id} in guild ${interaction.guildId}`);
    } catch (error) {
      logger.error('Fact command error:', error);
      await handleInteractionError(interaction, error, {
        commandName: 'fact',
        source: 'fact_command'
      });
    }
  },
};




