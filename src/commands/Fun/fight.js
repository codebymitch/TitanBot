import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError, TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';

const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

export default {
    data: new SlashCommandBuilder()
    .setName("fight")
    .setDescription("Starts a simulated 1v1 text-based battle.")
    .addUserOption((option) =>
      option
        .setName("opponent")
        .setDescription("The user to fight.")
        .setRequired(true),
    ),
  category: 'Fun',

  async execute(interaction, config, client) {
    try {
      await interaction.deferReply();

      const challenger = interaction.user;
      const opponent = interaction.options.getUser("opponent");

      // Validate opponent is not the challenger
      if (challenger.id === opponent.id) {
        const embed = warningEmbed(
          "⚔️ Invalid Challenge",
          `**${challenger.username}**, you can't fight yourself! That's a draw before it even starts.`
        );
        return await interaction.editReply({ embeds: [embed] });
      }

      // Validate opponent is not a bot
      if (opponent.bot) {
        throw new TitanBotError(
          `User tried to fight a bot: ${opponent.id}`,
          ErrorTypes.USER_INPUT,
          "You can't fight bots! Challenge a real person instead."
        );
      }

      const winner = rand(0, 1) === 0 ? challenger : opponent;
      const loser = winner.id === challenger.id ? opponent : challenger;
      const rounds = rand(3, 7);
      const damage = rand(10, 50);

      const log = [];
      log.push(
        `💥 **${challenger.username}** challenges **${opponent.username}** to a duel! (Best of ${rounds} rounds)`,
      );

      for (let i = 1; i <= rounds; i++) {
        const attacker = rand(0, 1) === 0 ? challenger : opponent;
        const target = attacker.id === challenger.id ? opponent : challenger;
        const action = [
          "throws a wild punch",
          "lands a critical hit",
          "uses a weak spell",
          "parries and counterattacks",
        ][rand(0, 3)];
        log.push(
          `\n**Round ${i}:** ${attacker.username} ${action} on ${target.username} for ${rand(1, damage)} damage!`,
        );
      }

      const outcomeText = log.join("\n");

      const embed = successEmbed(
        "🏆 Duel Complete!",
        `${outcomeText}\n\n👑 **${winner.username}** has defeated ${loser.username} and claims the victory!`
      );

      await interaction.editReply({ embeds: [embed] });
      logger.debug(`Fight command executed between ${challenger.id} and ${opponent.id} in guild ${interaction.guildId}`);
    } catch (error) {
      logger.error('Fight command error:', error);
      await handleInteractionError(interaction, error, {
        commandName: 'fight',
        source: 'fight_command'
      });
    }
  },
};





