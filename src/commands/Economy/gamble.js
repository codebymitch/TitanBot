import { SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';

// --- Configuration ---
// Base chance of winning (40%)
const BASE_WIN_CHANCE = 0.4;
// Bonus chance provided by the Lucky Clover (+10%)
const CLOVER_WIN_BONUS = 0.1;
// Payout multiplier (e.g., betting 100 wins 2x, total returned 200)
const PAYOUT_MULTIPLIER = 2.0;
// Cooldown (e.g., 5 minutes to prevent spam)
const GAMBLE_COOLDOWN = 5 * 60 * 1000;

export default {
    data: new SlashCommandBuilder()
        .setName("gamble")
        .setDescription("Bet a certain amount of cash and try your luck.")
        .addIntegerOption((option) =>
            option
                .setName("amount")
                .setDescription("The amount of cash to bet.")
                .setRequired(true)
                .setMinValue(1),
        )
        .setDMPermission(false),
    category: "Economy",

    async execute(interaction, config, client) {
        await interaction.deferReply();

        const userId = interaction.user.id;
        const guildId = interaction.guildId;
        const betAmount = interaction.options.getInteger("amount");
        const now = Date.now();

        try {
            const userData = await getEconomyData(client, guildId, userId);
            const lastGamble = userData.cooldowns.gamble || 0;
            let cloverCount = userData.inventory["lucky_clover"] || 0;

            // --- 1. Cooldown Check ---
            if (now < lastGamble + GAMBLE_COOLDOWN) {
                const remaining = lastGamble + GAMBLE_COOLDOWN - now;
                const minutes = Math.floor(remaining / (1000 * 60));
                const seconds = Math.floor((remaining % (1000 * 60)) / 1000);

                return interaction.editReply({
                    embeds: [
                        errorEmbed(
                            "Cooldown Active",
                            `You need to cool down before gambling again. Wait **${minutes}m ${seconds}s}**.`,
                        ),
                    ],
                });
            }

            // --- 2. Funds Check ---
            if (userData.cash < betAmount) {
                return interaction.editReply({
                    embeds: [
                        errorEmbed(
                            "Insufficient Cash",
                            `You only have $${userData.cash.toLocaleString()} cash, but you are trying to bet $${betAmount.toLocaleString()}.`,
                        ),
                    ],
                });
            }

            // --- 3. Determine Win Chance and Use Clover ---
            let winChance = BASE_WIN_CHANCE;
            let cloverMessage = "";
            let usedClover = false;

            if (cloverCount > 0) {
                // Use a clover for this gamble
                winChance += CLOVER_WIN_BONUS;
                userData.inventory["lucky_clover"] -= 1;
                cloverMessage = `\n🍀 **Lucky Clover Consumed:** Your win chance was boosted to **${Math.round(winChance * 100)}%**!`;
                usedClover = true;
            }

            // --- 4. Gambling Logic ---
            const win = Math.random() < winChance;
            let cashChange = 0;
            let resultEmbed;

            if (win) {
                const amountWon = Math.floor(betAmount * PAYOUT_MULTIPLIER);
                cashChange = amountWon; // Amount gained (includes the original bet)

                resultEmbed = successEmbed(
                    "🎉 You Won!",
                    `You successfully gambled and turned your **$${betAmount.toLocaleString()}** bet into **$${amountWon.toLocaleString()}**!${cloverMessage}`,
                );
            } else {
                cashChange = -betAmount; // Amount lost

                resultEmbed = errorEmbed(
                    "💔 You Lost...",
                    `The dice rolled against you. You lost your **$${betAmount.toLocaleString()}** bet.`,
                );
            }

            // --- 5. Update Database ---
            userData.cash += cashChange;
            userData.cooldowns.gamble = now; // Update cooldown

            // Save data
            await setEconomyData(client, guildId, userId, userData);

            // --- 6. Send Response ---
            const newCash = userData.cash;

            resultEmbed.addFields({
                name: "💵 New Cash Balance",
                value: `$${newCash.toLocaleString()}`,
                inline: true,
            });

            if (usedClover) {
                resultEmbed.setFooter({
                    text: `You have ${userData.inventory["lucky_clover"]} Lucky Clovers left.`,
                });
            } else {
                resultEmbed.setFooter({
                    text: `Next gamble available in 5 minutes. Base win chance: ${Math.round(BASE_WIN_CHANCE * 100)}%.`,
                });
            }

            await interaction.editReply({ embeds: [resultEmbed] });
        } catch (error) {
            console.error("Gamble command error:", error);
            await interaction.editReply({
                embeds: [
                    errorEmbed(
                        "System Error",
                        "Could not process your gamble.",
                    ),
                ],
            });
        }
    },
};
