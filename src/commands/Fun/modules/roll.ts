import type { Command } from '../../../types/index.js';
import { SlashCommandBuilder } from 'discord.js';
import { successEmbed } from '../../../utils/embeds.js';
import { logger } from '../../../utils/logger.js';
import { NexoBotError, ErrorTypes } from '../../../utils/errorHandler.js';

import { InteractionHelper } from '../../../utils/interactionHelper.js';
export default {
    data: new SlashCommandBuilder()
    .setName("roll")
    .setDescription("Würfelt mit Standardnotation (z. B. 2d20, 1d6 + 5).")
    .addStringOption((option) =>
      option
        .setName("notation")
        .setDescription("Die Würfelnotation (z. B. 2d6, 1d20 + 4)")
        .setRequired(true)
        .setMaxLength(50),
    ),
  category: 'Fun',

  async execute(interaction, config, client) {
    await InteractionHelper.safeDefer(interaction);

    const notation = interaction.options
      .getString("notation")!
      .toLowerCase()
      .replace(/\s/g, "");

    const match = notation.match(/^(\d*)d(\d+)([\+\-]\d+)?$/);

    if (!match) {
      throw new NexoBotError(
        `Invalid dice notation: ${notation}`,
        ErrorTypes.USER_INPUT,
        'Ungültige Notation. Nutze ein Format wie `1d20` oder `3d6+5`.'
      );
    }

    const numDice = parseInt(match[1] || "1", 10);
    const numSides = parseInt(match[2], 10);
    const modifier = parseInt(match[3] || "0", 10);

    if (numDice < 1 || numDice > 20) {
      throw new NexoBotError(
        `Too many dice requested: ${numDice}`,
        ErrorTypes.VALIDATION,
        'Die Anzahl der Würfel muss zwischen 1 und 20 liegen.'
      );
    }

    if (numSides < 1 || numSides > 1000) {
      throw new NexoBotError(
        `Invalid number of sides: ${numSides}`,
        ErrorTypes.VALIDATION,
        'Die Anzahl der Seiten muss zwischen 1 und 1000 liegen.'
      );
    }

    let rolls = [];
    let totalRoll = 0;

    for (let i = 0; i < numDice; i++) {
      const roll = Math.floor(Math.random() * numSides) + 1;
      rolls.push(roll);
      totalRoll += roll;
    }

    const finalTotal = totalRoll + modifier;

    const resultsDetail =
      numDice > 1 ? `**Würfe:** ${rolls.join(" + ")}\n` : "";
    const modifierText = modifier !== 0 ? `+ (${modifier})` : "";

    const embed = successEmbed(
      `🎲 Würfle ${numDice}d${numSides}${modifier !== 0 ? match[3] : ""}`,
      `${resultsDetail}**Gesamtwurf:** ${totalRoll}${modifierText} = **${finalTotal}**`,
    );

    await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    logger.debug(`Roll command executed by user ${interaction.user.id} with notation ${notation} in guild ${interaction.guildId}`);
  },
} satisfies Command;
