import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';

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
        .setName('work')
        .setDescription('Work to earn some money'),

    async execute(interaction, config, client) {
        try {
            const userId = interaction.user.id;
            const guildId = interaction.guildId;
            const now = Date.now();

            const userData = await getEconomyData(client, guildId, userId);
            
            // Ensure userData exists and has proper structure
            if (!userData) {
                await interaction.editReply({
                    embeds: [errorEmbed("Error", "Failed to load your economy data. Please try again later.")],
                });
                return;
            }

            const lastWork = userData.lastWork || 0;
            const inventory = userData.inventory || {};
            const extraWorkShifts = inventory["extra_work"] || 0;

            // --- 1. Check Cooldown/Consumable Use ---
            let cooldownActive = now < lastWork + WORK_COOLDOWN;
            let usedConsumable = false;

            if (cooldownActive) {
                if (extraWorkShifts > 0) {
                    // Use the consumable to bypass the cooldown
                    inventory["extra_work"] = (inventory["extra_work"] || 0) - 1;
                    usedConsumable = true;
                } else {
                    // User is on cooldown and has no consumable
                    const remaining = lastWork + WORK_COOLDOWN - now;
                    const hours = Math.floor(remaining / (1000 * 60 * 60));
                    const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));

                    await interaction.editReply({
                        embeds: [
                            errorEmbed(
                                "Work Cooldown",
                                `You need to rest before working again. Wait **${hours}h ${minutes}m**.`
                            ),
                        ],
                    });
                    return;
                }
            }

            // --- 2. Calculate Earnings ---
            const earned = Math.floor(Math.random() * (MAX_WORK_AMOUNT - MIN_WORK_AMOUNT + 1)) + MIN_WORK_AMOUNT;
            const job = WORK_JOBS[Math.floor(Math.random() * WORK_JOBS.length)];

            // --- 3. Update User Data ---
            userData.wallet = (userData.wallet || 0) + earned;
            userData.lastWork = now;

            // Save data
            await setEconomyData(client, guildId, userId, userData);

            // --- 4. Send Response ---
            const embed = successEmbed(
                "💼 Work Complete!",
                `You worked as a **${job}** and earned **$${earned.toLocaleString()}**!`
            )
                .addFields(
                    {
                        name: "💰 New Balance",
                        value: `$${userData.wallet.toLocaleString()}`,
                        inline: true,
                    },
                    {
                        name: "⏰ Next Work",
                        value: `<t:${Math.floor((now + WORK_COOLDOWN) / 1000)}:R>`,
                        inline: true,
                    }
                )
                .setFooter({
                    text: `Requested by ${interaction.user.tag}`,
                    iconURL: interaction.user.displayAvatarURL(),
                });

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error("Work command error:", error);
            await interaction.editReply({
                embeds: [
                    errorEmbed(
                        "System Error",
                        "Could not complete work at this time.",
                    ),
                ],
            });
        }
    },
};

