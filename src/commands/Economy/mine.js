import { SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';

// --- Configuration ---
const MINE_COOLDOWN = 60 * 60 * 1000; // 1 hour
const BASE_MIN_REWARD = 400;
const BASE_MAX_REWARD = 1200;
const DIAMOND_PICKAXE_MULTIPLIER = 1.5; // +50% reward if the user owns the upgrade

const MINE_LOCATIONS = [
    "abandoned gold mine",
    "dark, damp cave",
    "backyard rock quarry",
    "volcanic obsidian vent",
    "deep-sea mineral trench",
];

export default {
    data: new SlashCommandBuilder()
        .setName("mine")
        .setDescription(
            "Go mining for valuable minerals to earn a cash reward.",
        )
        .setDMPermission(false),
    category: "Economy",

    async execute(interaction, config, client) {
        await interaction.deferReply();

        const userId = interaction.user.id;
        const guildId = interaction.guildId;
        const now = Date.now();

        try {
            const userData = await getEconomyData(client, guildId, userId);
            const lastMine = userData.cooldowns.mine || 0;
            const hasPickaxe = userData.upgrades["diamond_pickaxe"] || 0; // Check for Diamond Pickaxe

            // --- 1. Check Cooldown ---
            if (now < lastMine + MINE_COOLDOWN) {
                const remaining = lastMine + MINE_COOLDOWN - now;
                const hours = Math.floor(remaining / (1000 * 60 * 60));
                const minutes = Math.floor(
                    (remaining % (1000 * 60 * 60)) / (1000 * 60),
                );

                return interaction.editReply({
                    embeds: [
                        errorEmbed(
                            "Mining Cooldown Active",
                            `Your pickaxe is cooling down. Wait for **${hours}h ${minutes}m** before mining again.`,
                        ),
                    ],
                });
            }

            // --- 2. Calculate Reward ---
            const baseEarned =
                Math.floor(
                    Math.random() * (BASE_MAX_REWARD - BASE_MIN_REWARD + 1),
                ) + BASE_MIN_REWARD;

            let finalEarned = baseEarned;
            let multiplierMessage = "";

            // Apply Diamond Pickaxe bonus
            if (hasPickaxe > 0) {
                finalEarned = Math.floor(
                    baseEarned * DIAMOND_PICKAXE_MULTIPLIER,
                );
                multiplierMessage = `\n(💎 Diamond Pickaxe Bonus: **+50%**)`;
            }

            const location =
                MINE_LOCATIONS[
                    Math.floor(Math.random() * MINE_LOCATIONS.length)
                ];

            // --- 3. Update Data ---
            userData.cash += finalEarned;
            userData.cooldowns.mine = now; // Update cooldown

            // Save data
            await setEconomyData(client, guildId, userId, userData);

            // --- 4. Prepare Response ---
            const embed = successEmbed(
                "💰 Mining Expedition Successful!",
                `You explored a **${location}** and managed to find minerals worth **$${finalEarned.toLocaleString()}**!${multiplierMessage}`,
            )
                .addFields({
                    name: "💵 New Cash Balance",
                    value: `$${userData.cash.toLocaleString()}`,
                    inline: true,
                })
                .setFooter({ text: `Next mine available in 1 hour.` });

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error("Mine command error:", error);
            await interaction.editReply({
                embeds: [
                    errorEmbed(
                        "System Error",
                        "Could not process your mining action.",
                    ),
                ],
            });
        }
    },
};
