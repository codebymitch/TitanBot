import { SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';

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
        .setName("beg")
        .setDescription("Beg for a small amount of currency."),
    category: "Economy",

    /**
     * @param {import('discord.js').ChatInputCommandInteraction} interaction
     * @param {object} config
     * @param {import('discord.js').Client} client
     */
    async execute(interaction, config, client) {
        await interaction.deferReply();
        const userId = interaction.user.id;
        const guildId = interaction.guildId;
        const economyKey = getEconomyKey(guildId, userId);

        // 1. Fetch user data (including the last beg timestamp)
        // Default structure: { cash: 0, bank: 0, lastBeg: 0 }
        let userData = await client.db.get(economyKey, {
            cash: 0,
            bank: 0,
            lastBeg: 0,
        });

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
        let newCash = userData.cash;

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
        userData.cash = newCash;
        userData.lastBeg = Date.now(); // Update the cooldown timestamp

        await client.db.set(economyKey, userData);

        // 5. Send Reply
        await interaction.editReply({ embeds: [replyEmbed] });
    },
};
