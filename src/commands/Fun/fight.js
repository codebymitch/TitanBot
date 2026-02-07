import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';

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

  async execute(interaction) {
try {
      const challenger = interaction.user;
      const opponent = interaction.options.getUser("opponent");

      if (challenger.id === opponent.id) {
        return interaction.reply({
          content: `⚔️ **${challenger.username}** can't fight themselves! That's a draw before it even starts.`,
        });
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
        `${outcomeText}\n\n👑 **${winner.username}** has defeated ${loser.username} and claims the victory!`,
        `🏆 Duel Complete!`
      );

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error("Fight command error:", error);
      await interaction.editReply({ embeds: [errorEmbed("System Error", "Could not run the fight command.")] });
    }
  },
};
