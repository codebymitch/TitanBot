import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { botConfig } from '../../config/bot.js';

// --- Configuration ---
// Cooldown in milliseconds (e.g., 30 minutes = 30 * 60 * 1000)
const COOLDOWN = 30 * 60 * 1000;
// Minimum and Maximum amount a user can win
const MIN_WIN = 50;
const MAX_WIN = 200;
// Chance of success (70% chance to win)
const SUCCESS_CHANCE = 0.7;

export default {
    data: new SlashCommandBuilder()
        .setName('beg')
        .setDescription('Beg for a small amount of money'),

    async execute(interaction, config, client) {
        try {
            const userId = interaction.user.id;
            const guildId = interaction.guildId;

            // 1. Fetch user data using the economy service
            let userData = await getEconomyData(client, guildId, userId);

            // 2. Check Cooldown
            const lastBeg = userData.lastBeg || 0;
            const remainingTime = lastBeg + COOLDOWN - Date.now();

            if (remainingTime > 0) {
                const minutes = Math.floor(remainingTime / 60000);
                const seconds = Math.floor((remainingTime % 60000) / 1000);

                let timeMessage =
                    minutes > 0 ? `${minutes} minute(s)` : `${seconds} second(s)`;

                return interaction.editReply({
                    embeds: [
                        errorEmbed(
                            "Slow Down!",
                            `You are tired from begging! Try again in **${timeMessage}**.`,
                        ),
                    ],
                });
            }

            // --- 3. Determine Outcome ---
            const success = Math.random() < SUCCESS_CHANCE;

            let replyEmbed;
            let newCash = userData.wallet;

            if (success) {
                const amountWon =
                    Math.floor(Math.random() * (MAX_WIN - MIN_WIN + 1)) + MIN_WIN;

                // Update the user's cash balance
                newCash += amountWon;

                // Random success messages
                const successMessages = [
                    `A kind stranger drops **$${amountWon.toLocaleString()}** into your cup.`,
                    `You spotted an unattended wallet! You grab **$${amountWon.toLocaleString()}** and run.`,
                    `Someone took pity on you and gave you **$${amountWon.toLocaleString()}**!`,
                    `You found **$${amountWon.toLocaleString()}** under a park bench.`,
                ];

                replyEmbed = successEmbed(
                    "🙏 Begging Successful!",
                    successMessages[
                        Math.floor(Math.random() * successMessages.length)
                    ],
                );
            } else {
                // Random failure messages
                const failMessages = [
                    "The police chased you off. You got nothing.",
                    "Someone yelled, 'Get a job!' and walked past.",
                    "A squirrel stole the single coin you had.",
                    "You tried to beg, but you were too embarrassed and gave up.",
                ];

                replyEmbed = errorEmbed(
                    "😥 Begging Failed",
                    failMessages[Math.floor(Math.random() * failMessages.length)],
                );
            }

            // 4. Update Database
            userData.wallet = newCash;
            userData.lastBeg = Date.now(); // Update the cooldown timestamp

            await setEconomyData(client, guildId, userId, userData);

            // 5. Send Reply
            await interaction.editReply({ embeds: [replyEmbed] });
        } catch (error) {
            console.error("Beg command error:", error);
            await interaction.editReply({
                embeds: [
                    errorEmbed(
                        "System Error",
                        "Could not complete the beg command at this time.",
                    ),
                ],
            });
        }
    },
};

