import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError, TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
export default {
    data: new SlashCommandBuilder()
    .setName("flip")
    .setDescription("Flips a coin (Heads or Tails)."),
  category: 'Fun',

  async execute(interaction, config, client) {
    try {
      const result = Math.random() < 0.5 ? "Heads" : "Tails";
      const emoji = result === "Heads" ? "🪙" : "🔮";

      const embed = successEmbed(
        "Heads or Tails?",
        `The coin landed on... **${result}** ${emoji}!`,
      );

      await InteractionHelper.safeReply(interaction, { embeds: [embed] });
      logger.debug(`Flip command executed by user ${interaction.user.id} in guild ${interaction.guildId}`);
    } catch (error) {
      logger.error('Flip command error:', error);
      await handleInteractionError(interaction, error, {
        commandName: 'flip',
        source: 'flip_command'
      });
    }
  },
};



