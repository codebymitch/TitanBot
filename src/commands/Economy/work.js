import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';
import { getEconomyData, setEconomyData } from '../../services/economy.js';
import { botConfig } from '../../config/bot.js';

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
    // Slash command data
    data: new SlashCommandBuilder()
        .setName("work")
        .setDescription("Do some work to earn money.")
        .setDMPermission(false),
    
    // Prefix command data
    name: "work",
    aliases: ["job", "employment"],
    description: "Do some work to earn money.",
    category: "Economy",
    usage: `${botConfig.commands.prefix}work`,
    cooldown: 30, // 30 minutes

    // Slash command execution
    async execute(interaction, config, client) {
        await interaction.deferReply();

        const userId = interaction.user.id;
        const guildId = interaction.guildId;
        const now = Date.now();

        try {
            const userData = await getEconomyData(client, guildId, userId);
            const lastWork = userData.lastWork || 0;
            const extraWorkShifts = userData.inventory["extra_work"] || 0;

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
                    const seconds = Math.floor((remaining % (1000 * 60)) / 1000);

                    return interaction.editReply({
                        embeds: [
                            errorEmbed(
                                "Work Cooldown",
                                `You need to rest! You can work again in \`${minutes}m ${seconds}s\`.`,
                            ),
                        ],
                    });
                }
            }

            // --- 2. Calculate Earnings ---
            const earned = Math.floor(Math.random() * (MAX_WORK_AMOUNT - MIN_WORK_AMOUNT + 1)) + MIN_WORK_AMOUNT;
            const job = WORK_JOBS[Math.floor(Math.random() * WORK_JOBS.length)];

            // --- 3. Update User Data ---
            userData.wallet += earned;
            userData.lastWork = now;
            await setEconomyData(client, guildId, userId, userData);

            // --- 4. Send Response ---
            const embed = successEmbed(
                "Work Completed!",
                `You worked as a **${job}** and earned **\$${earned}**!${usedConsumable ? " (Used Extra Work consumable)" : ""}`,
            )
                .addFields(
                    {
                        name: "💰 Current Balance",
                        value: `Wallet: \$${userData.wallet.toLocaleString()}`,
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
            console.error("Error in work command:", error);
            await interaction.editReply({
                embeds: [errorEmbed("Failed to process work. Please try again later.")],
            });
        }
    },

    // Prefix command execution
    async executeMessage(message, args, client) {
        const userId = message.author.id;
        const guildId = message.guild.id;
        const now = Date.now();

        try {
            const userData = await getEconomyData(client, guildId, userId);
            const lastWork = userData.lastWork || 0;
            const extraWorkShifts = userData.inventory["extra_work"] || 0;

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
                    const seconds = Math.floor((remaining % (1000 * 60)) / 1000);

                    return message.reply({
                        embeds: [
                            errorEmbed(
                                "Work Cooldown",
                                `You need to rest! You can work again in \`${minutes}m ${seconds}s\`.`,
                            ),
                        ],
                    });
                }
            }

            // --- 2. Calculate Earnings ---
            const earned = Math.floor(Math.random() * (MAX_WORK_AMOUNT - MIN_WORK_AMOUNT + 1)) + MIN_WORK_AMOUNT;
            const job = WORK_JOBS[Math.floor(Math.random() * WORK_JOBS.length)];

            // --- 3. Update User Data ---
            userData.wallet += earned;
            userData.lastWork = now;
            await setEconomyData(client, guildId, userId, userData);

            // --- 4. Send Response ---
            const embed = successEmbed(
                "Work Completed!",
                `You worked as a **${job}** and earned **\$${earned}**!${usedConsumable ? " (Used Extra Work consumable)" : ""}`,
            )
                .addFields(
                    {
                        name: "💰 Current Balance",
                        value: `Wallet: \$${userData.wallet.toLocaleString()}`,
                        inline: true,
                    },
                    {
                        name: "⏰ Next Work",
                        value: `<t:${Math.floor((now + WORK_COOLDOWN) / 1000)}:R>`,
                        inline: true,
                    }
                )
                .setFooter({
                    text: `Requested by ${message.author.tag}`,
                    iconURL: message.author.displayAvatarURL(),
                });

            await message.reply({ embeds: [embed] });

        } catch (error) {
            console.error("Error in work command:", error);
            await message.reply({
                embeds: [errorEmbed("Failed to process work. Please try again later.")],
            });
        }
    }
};
