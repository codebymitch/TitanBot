import type { Command } from '../../../types/index.js';
import { SlashCommandBuilder } from 'discord.js';
import { successEmbed, warningEmbed } from '../../../utils/embeds.js';
import { logger } from '../../../utils/logger.js';

import { InteractionHelper } from '../../../utils/interactionHelper.js';
const rand = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const EMBED_DESCRIPTION_LIMIT = 4096;

export default {
    data: new SlashCommandBuilder()
    .setName("fight")
    .setDescription("Startet einen simulierten 1-gegen-1-Textkampf.")
    .addUserOption((option) =>
      option
        .setName("opponent")
        .setDescription("Der Nutzer, gegen den du kämpfst.")
        .setRequired(true),
    ),
  category: 'Fun',

  async execute(interaction, config, client) {
    await InteractionHelper.safeDefer(interaction);

    const challenger = interaction.user;
    const opponent = interaction.options.getUser("opponent")!;

    if (challenger.id === opponent.id) {
      const embed = warningEmbed(
        "⚔️ Ungültige Herausforderung",
        `**${challenger.username}**, du kannst nicht gegen dich selbst kämpfen! Das wäre ein Unentschieden, bevor es überhaupt losgeht.`
      );
      return await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    }

    if (opponent.bot) {
      const embed = warningEmbed(
        "⚔️ Ungültiger Gegner",
        "Du kannst nicht gegen Bots kämpfen! Fordere lieber eine echte Person heraus."
      );
      return await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    }

    const winner = rand(0, 1) === 0 ? challenger : opponent;
    const loser = winner.id === challenger.id ? opponent : challenger;
    const rounds = rand(3, 7);
    const damage = rand(10, 50);

    const log: string[] = [];
    log.push(
      `💥 **${challenger.username}** fordert **${opponent.username}** zum Duell heraus! (${rounds} Runden)`,
    );

    for (let i = 1; i <= rounds; i++) {
      const attacker = rand(0, 1) === 0 ? challenger : opponent;
      const target = attacker.id === challenger.id ? opponent : challenger;
      const action = [
        "schlägt wild zu",
        "landet einen kritischen Treffer",
        "wirkt einen schwachen Zauber",
        "pariert und kontert",
      ][rand(0, 3)];
      log.push(
        `\n**Runde ${i}:** ${attacker.username} ${action} gegen ${target.username} und verursacht ${rand(1, damage)} Schaden!`,
      );
    }

    const outcomeText = log.join("\n");
    const winnerText = `👑 **${winner.username}** hat ${loser.username} besiegt und holt sich den Sieg!`;
    const fullDescription = `${outcomeText}\n\n${winnerText}`;

    const description = fullDescription.length <= EMBED_DESCRIPTION_LIMIT
      ? fullDescription
      : `${fullDescription.slice(0, EMBED_DESCRIPTION_LIMIT - 15)}\n\n...`;

    const embed = successEmbed(
      "🏆 Duell beendet!",
      description
    );

    await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    logger.debug(`Fight command executed between ${challenger.id} and ${opponent.id} in guild ${interaction.guildId}`);
  },
} satisfies Command;
