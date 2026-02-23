import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { getGuildConfig } from '../../services/guildConfig.js';
import { formatDuration } from '../../utils/helpers.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const DAILY_COOLDOWN = 24 * 60 * 60 * 1000;
const DAILY_AMOUNT = 1000;
const PREMIUM_BONUS_PERCENTAGE = 0.1;

export default {
    data: new SlashCommandBuilder()
        .setName('daily')
        .setDescription('Claim your daily cash reward'),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;
            
            const userId = interaction.user.id;
            const guildId = interaction.guildId;
            const now = Date.now();

            logger.debug(`[ECONOMY] Daily claimed started for ${userId}`, { userId, guildId });

            const userData = await getEconomyData(client, guildId, userId);
            
            if (!userData) {
                throw createError(
                    "Failed to load economy data for daily",
                    ErrorTypes.DATABASE,
                    "Failed to load your economy data. Please try again later.",
                    { userId, guildId }
                );
            }
            
            const lastDaily = userData.lastDaily || 0;

            if (now < lastDaily + DAILY_COOLDOWN) {
                const timeRemaining = lastDaily + DAILY_COOLDOWN - now;
                throw createError(
                    "Daily cooldown active",
                    ErrorTypes.RATE_LIMIT,
                    `You need to wait before claiming daily again. Try again in **${formatDuration(timeRemaining)}**.`,
                    { timeRemaining, cooldownType: 'daily' }
                );
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
                bonusMessage = `\n✨ **Premium Bonus:** +$${bonusAmount.toLocaleString()}`;
                hasPremiumRole = true;
            }

            userData.wallet = (userData.wallet || 0) + earned;
            userData.lastDaily = now;

            await setEconomyData(client, guildId, userId, userData);

            logger.info(`[ECONOMY_TRANSACTION] Daily claimed`, {
                userId,
                guildId,
                amount: earned,
                newWallet: userData.wallet,
                hasPremium: hasPremiumRole,
                timestamp: new Date().toISOString()
            });

            const embed = successEmbed(
                "✅ Daily Claimed!",
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

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    }, { command: 'daily' })
};




