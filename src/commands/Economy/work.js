import { SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';

const WORK_COOLDOWN = 30 * 60 * 1000; // 30 minutes
const MIN_WORK_AMOUNT = 50;
const MAX_WORK_AMOUNT = 300;
const WORK_JOBS = [
    "Software Developer",
    "Barista",
    "Janitor",
    "YouTuber",
    "Discord Bot Developer",
    "Cashier",
    "Pizza Delivery Driver",
    "Librarian",
    "Gardener",
    "Data Analyst",
];

export default {
    data: new SlashCommandBuilder()
        .setName("work")
        .setDescription("Do some work to earn money.")
        .setDMPermission(false),
    category: "Economy",

    async execute(interaction, config, client) {
        await interaction.deferReply();

        const userId = interaction.user.id;
        const guildId = interaction.guildId;
        const now = Date.now();

        try {
            const userData = await getEconomyData(client, guildId, userId);
            const lastWork = userData.cooldowns.work || 0;
            const extraWorkShifts = userData.inventory["extra_work"] || 0; // Check for consumable

            // --- 1. Check Cooldown/Consumable Use ---
            let cooldownActive = now < lastWork + WORK_COOLDOWN;
            let usedConsumable = false;

            if (cooldownActive) {
                if (extraWorkShifts > 0) {
                    // Use the consumable to bypass the cooldown
                    userData.inventory["extra_work"] -= 1;
                    usedConsumable = true;
                } else {
                    // User is on cooldown and has no consumable
                    const remaining = lastWork + WORK_COOLDOWN - now;
                    const minutes = Math.floor(remaining / (1000 * 60));
                    const seconds = Math.floor(
                        (remaining % (1000 * 60)) / 1000,
                    );

                    return interaction.editReply({
                        embeds: [
                            errorEmbed(
                                "Cooldown Active",
                                `You are tired! Rest for **${minutes}m ${seconds}s** before working again. (You currently have **${extraWorkShifts}** Extra Work Shifts available.)`,
                            ),
                        ],
                    });
                }
            }

            // --- 2. Calculate Reward ---
            const earned =
                Math.floor(
                    Math.random() * (MAX_WORK_AMOUNT - MIN_WORK_AMOUNT + 1),
                ) + MIN_WORK_AMOUNT;
            const job = WORK_JOBS[Math.floor(Math.random() * WORK_JOBS.length)];

            // --- 3. Update Data ---
            userData.cash += earned;

            // Only update the cooldown timestamp if a consumable was NOT used.
            // If the consumable was used, we let the existing cooldown timer continue.
            if (!usedConsumable) {
                userData.cooldowns.work = now;
            }

            // Save data
            await setEconomyData(client, guildId, userId, userData);

            // --- 4. Prepare Response ---
            let description = `You worked as a **${job}** and earned **$${earned.toLocaleString()}**!`;
            if (usedConsumable) {
                description += `\n**🎉 Cooldown Skipped!** 1x Extra Work Shift was consumed.`;
            }

            const embed = successEmbed("💼 Work Complete!", description)
                .addFields({
                    name: "💵 New Cash Balance",
                    value: `$${userData.cash.toLocaleString()}`,
                    inline: true,
                })
                .setFooter({
                    text: usedConsumable
                        ? `You have ${userData.inventory["extra_work"]} Extra Work Shifts left.`
                        : `Next work available in 30 minutes.`,
                });

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error("Work command error:", error);
            await interaction.editReply({
                embeds: [
                    errorEmbed(
                        "System Error",
                        "Could not process your work action.",
                    ),
                ],
            });
        }
    },
};
