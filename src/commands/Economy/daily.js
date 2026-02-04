import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { getGuildConfig } from '../../services/guildConfig.js';
import { formatDuration } from '../../utils/helpers.js';

const DAILY_COOLDOWN = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
const DAILY_AMOUNT = 1000;
const PREMIUM_BONUS_PERCENTAGE = 0.1; // 10% bonus

export default {
    data: new SlashCommandBuilder()
        .setName('daily')
        .setDescription('Claim your daily cash reward'),

    async execute(interaction, config, client) {
        // Use ephemeral: false for the daily command since it's typically public

        const userId = interaction.user.id;
        const guildId = interaction.guildId;
        const now = Date.now();

        try {
            const userData = await getEconomyData(client, guildId, userId);
            const lastDaily = userData.lastDaily || 0;

            // --- 1. Cooldown Check ---
            if (now < lastDaily + DAILY_COOLDOWN) {
                const timeRemaining = lastDaily + DAILY_COOLDOWN - now;
                return interaction.editReply({
                    embeds: [
                        errorEmbed(
                            "⏳ Cooldown Active",
                            `You can claim your daily reward again in **${formatDuration(timeRemaining)}**.`,
                        ),
                    ],
                });
            }

            // --- GET GUILD CONFIG & ROLE ID ---
            const guildConfig = await getGuildConfig(client, guildId);
            const PREMIUM_ROLE_ID = guildConfig.premiumRoleId;
            // ---------------------------------

            // --- 2. Calculate Reward & Bonus ---
            let earned = DAILY_AMOUNT;
            let bonusMessage = "";
            let hasPremiumRole = false;

            // Check for Premium Role if it has been configured
            if (
                PREMIUM_ROLE_ID &&
                interaction.member &&
                interaction.member.roles.cache.has(PREMIUM_ROLE_ID)
            ) {
                const bonusAmount = Math.floor(
                    DAILY_AMOUNT * PREMIUM_BONUS_PERCENTAGE,
                );
                earned += bonusAmount;
                bonusMessage = `\n✨ **Premium Bonus:** +$${bonusAmount.toLocaleString()}`;
                hasPremiumRole = true;
            }

            // --- 3. Update Data ---
            userData.wallet = (userData.wallet || 0) + earned;
            userData.lastDaily = now; // Update the cooldown timestamp

            await setEconomyData(client, guildId, userId, userData);

            // --- 4. Prepare Response ---
            const embed = successEmbed(
                "✅ Daily Reward Claimed!",
                `You have claimed your daily **$${earned.toLocaleString()}**!${bonusMessage}`,
            )
                .addFields({
                    name: "New Cash Balance",
                    value: `$${userData.wallet.toLocaleString()}`,
                    inline: true,
                })
                .setFooter({
                    text: hasPremiumRole
                        ? `Next claim in 24 hours. (Premium Active)`
                        : `Next claim in 24 hours.`,
                });

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error("Daily command execution error:", error);
            await interaction.editReply({
                embeds: [
                    errorEmbed(
                        "System Error",
                        "An unexpected error occurred while claiming your reward. Check the console for details.",
                    ),
                ],
            });
        }
    },
};

