import { SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';

// Utility to generate a random number within a range
const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
// Migrated from: commands/Fun/fight.js
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
    await interaction.deferReply();
    const challenger = interaction.user;
    const opponent = interaction.options.getUser("opponent");

    if (challenger.id === opponent.id) {
      return interaction.editReply({
        content: `⚔️ **${challenger.username}** can't fight themselves! That's a draw before it even starts.`,
      });
    }

    // Simulate a fight with random winner and text log
    const winner = rand(0, 1) === 0 ? challenger : opponent;
    const loser = winner.id === challenger.id ? opponent : challenger;
    const rounds = rand(3, 7); // A random number of rounds
    const damage = rand(10, 50); // A random damage number

    const log = [];
    log.push(
      `💥 **${challenger.username}** challenges **${opponent.username}** to a duel! (Best of ${rounds} rounds)`,
    );

    // Add some random combat log lines
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

    // Final outcome
    const outcomeText = log.join("\n");

    const embed = successEmbed(
      `🏆 Duel Complete!`,
      `${outcomeText}\n\n👑 **${winner.username}** has defeated ${loser.username} and claims the victory!`,
    );

    await interaction.editReply({ embeds: [embed] });
  },
};
