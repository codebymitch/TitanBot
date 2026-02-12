import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { getGuildConfig } from '../../services/guildConfig.js';
import { formatDuration } from '../../utils/helpers.js';

const DAILY_COOLDOWN = 24 * 60 * 60 * 1000;
const DAILY_AMOUNT = 1000;
const PREMIUM_BONUS_PERCENTAGE = 0.1;

export default {
    data: new SlashCommandBuilder()
        .setName('daily')
        .setDescription('Claim your daily cash reward'),

    async execute(interaction, config, client) {
        try {
            await interaction.deferReply();
            
            const userId = interaction.user.id;
            const guildId = interaction.guildId;
            const now = Date.now();

            const userData = await getEconomyData(client, guildId, userId);
            
            if (!userData) {
                return await interaction.editReply({
                    embeds: [errorEmbed(
                        "âŒ Data Error",
                        "Failed to load your economy data. Please try again later."
                    )]
                });
            }
            
            const lastDaily = userData.lastDaily || 0;

            if (now < lastDaily + DAILY_COOLDOWN) {
                const timeRemaining = lastDaily + DAILY_COOLDOWN - now;
                return await interaction.editReply({
                    embeds: [errorEmbed(
                        "â±ï¸ Slow Down!",
                        `You need to wait before claiming daily again. Try again in ${formatDuration(timeRemaining)}.`
                    )]
                });
            }

            const guildConfig = await getGuildConfig(client, guildId);
            const PREMIUM_ROLE_ID = guildConfig.premiumRoleId;

            let earned = DAILY_AMOUNT;
            let bonusMessage = "";
            let hasPremiumRole = false;

            if (
                PREMIUM_ROLE_ID &&
                interaction.member &&
                interaction.member.roles.cache.has(PREMIUM_ROLE_ID)
            ) {
                const bonusAmount = Math.floor(
                    DAILY_AMOUNT * PREMIUM_BONUS_PERCENTAGE,
                );
                earned += bonusAmount;
                bonusMessage = `\nâœ¨ **Premium Bonus:** +$${bonusAmount.toLocaleString()}`;
                hasPremiumRole = true;
            }

            userData.wallet = (userData.wallet || 0) + earned;
userData.lastDaily = now;

            await setEconomyData(client, guildId, userId, userData);

            const embed = successEmbed(
                "âœ… Daily Claimed!",
                `You have claimed your daily **$${earned.toLocaleString()}**!${bonusMessage}`
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
            console.error('Daily command error:', error);
            try {
                await interaction.editReply({
                    embeds: [errorEmbed(
                        "âŒ Error",
                        "Something went wrong while claiming daily. Please try again."
                    )]
                });
            } catch (replyError) {
                console.error('Failed to send error response:', replyError);
            }
        }
    },
};

