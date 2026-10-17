import type { Command } from '../../../types/index.js';
import { SlashCommandBuilder, type GuildMember } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../../utils/embeds.js';
import { getEconomyData, setEconomyData } from '../../../utils/economy.js';
import { getGuildConfig } from '../../../services/config/guildConfig.js';
import { formatDuration } from '../../../utils/embeds.js';
import { withErrorHandling, createError, ErrorTypes } from '../../../utils/errorHandler.js';
import { logger } from '../../../utils/logger.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { botConfig } from '../../../config/bot.js';

const DAILY_COOLDOWN = 24 * 60 * 60 * 1000;
const DAILY_AMOUNT = botConfig.economy?.dailyAmount ?? 100;
const PREMIUM_BONUS_PERCENTAGE = 0.1;

export default {
    data: new SlashCommandBuilder()
        .setName('daily')
        .setDescription('Hol dir deine tägliche Belohnung'),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;
            
            const userId = interaction.user.id;
            const guildId = interaction.guildId!;
            const now = Date.now();

            logger.debug(`[ECONOMY] Daily claimed started for ${userId}`, { userId, guildId });

            const userData = await getEconomyData(client, guildId, userId);
            
            if (!userData) {
                throw createError(
                    "Failed to load economy data for daily",
                    ErrorTypes.DATABASE,
                    "Deine Wirtschaftsdaten konnten nicht geladen werden. Bitte versuch es später erneut.",
                    { userId, guildId }
                );
            }
            
            const lastDaily = userData.lastDaily || 0;

            if (now < lastDaily + DAILY_COOLDOWN) {
                const timeRemaining = lastDaily + DAILY_COOLDOWN - now;
                throw createError(
                    "Daily cooldown active",
                    ErrorTypes.RATE_LIMIT,
                    `Du musst noch warten, bevor du deine tägliche Belohnung wieder abholen kannst. Versuch es in **${formatDuration(timeRemaining)}** erneut.`,
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
                (interaction.member as GuildMember).roles.cache.has(PREMIUM_ROLE_ID)
            ) {
                const bonusAmount = Math.floor(
                    DAILY_AMOUNT * PREMIUM_BONUS_PERCENTAGE,
                );
                earned += bonusAmount;
                bonusMessage = `\n✨ **Premium-Bonus:** +$${bonusAmount.toLocaleString()}`;
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
                "✅ Tägliche Belohnung abgeholt!",
                `Du hast deine täglichen **$${earned.toLocaleString()}** abgeholt!${bonusMessage}`
            )
                .addFields({
                    name: "Geldbörse (neu)",
                    value: `$${userData.wallet.toLocaleString()}`,
                    inline: true,
                })
                .setFooter({
                    text: hasPremiumRole
                        ? `Nächste Abholung in 24 Stunden. (Premium aktiv)`
                        : `Nächste Abholung in 24 Stunden.`,
                });

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    }, { command: 'daily' })
} satisfies Command;
