import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';
import { getEconomyData, setEconomyData } from '../../services/economy.js';
import { botConfig } from '../../config/bot.js';

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
    // Slash command data
    data: new SlashCommandBuilder()
        .setName("mine")
        .setDescription(
            "Go mining for valuable minerals to earn a cash reward.",
        )
        .setDMPermission(false),
    
    // Prefix command data
    name: "mine",
    aliases: ["dig", "excavate", "prospect"],
    description: "Go mining for valuable minerals to earn a cash reward.",
    category: "Economy",
    usage: `${botConfig.commands.prefix}mine`,
    cooldown: 60, // 1 hour

    // Slash command execution
    async execute(interaction, config, client) {
        await interaction.deferReply();

        const userId = interaction.user.id;
        const guildId = interaction.guildId;
        const now = Date.now();

        try {
            const userData = await getEconomyData(client, guildId, userId);
            const lastMine = userData.lastMine || 0;
            const hasPickaxe = userData.inventory["diamond_pickaxe"] || 0; // Check for Diamond Pickaxe in inventory

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
            userData.wallet += finalEarned;
            userData.lastMine = now; // Update cooldown

            // Save data
            await setEconomyData(client, guildId, userId, userData);

            // --- 4. Prepare Response ---
            const embed = successEmbed(
                "💰 Mining Expedition Successful!",
                `You explored a **${location}** and managed to find minerals worth **$${finalEarned.toLocaleString()}**!${multiplierMessage}`,
            )
                .addFields({
                    name: "💵 New Cash Balance",
                    value: `$${userData.wallet.toLocaleString()}`,
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
