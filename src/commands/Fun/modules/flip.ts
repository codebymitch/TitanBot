import type { Command } from '../../../types/index.js';
import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../../utils/embeds.js';
import { logger } from '../../../utils/logger.js';
import { NexoBotError, ErrorTypes } from '../../../utils/errorHandler.js';

import { InteractionHelper } from '../../../utils/interactionHelper.js';
export default {
    data: new SlashCommandBuilder()
    .setName("flip")
    .setDescription("Wirft eine Münze (Kopf oder Zahl)."),
  category: 'Fun',

  async execute(interaction, config, client) {
    const result = Math.random() < 0.5 ? "Kopf" : "Zahl";
    const emoji = result === "Kopf" ? "🪙" : "🔮";

    const embed = successEmbed(
      "Kopf oder Zahl?",
      `Die Münze zeigt... **${result}** ${emoji}!`,
    );

    await InteractionHelper.safeReply(interaction, { embeds: [embed] });
    logger.debug(`Flip command executed by user ${interaction.user.id} in guild ${interaction.guildId}`);
  },
} satisfies Command;
