import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const SLUT_COOLDOWN = 45 * 60 * 1000;
const MIN_SLUT_AMOUNT = 100;
const MAX_SLUT_AMOUNT = 800;
const FAILURE_RATE = 0.25;

const SLUT_ACTIVITIES = [
    { name: "Street Walking", min: 100, max: 400, risk: 0.2 },
    { name: "Escort Service", min: 200, max: 600, risk: 0.25 },
    { name: "Private Party", min: 300, max: 800, risk: 0.3 },
    { name: "VIP Client", min: 500, max: 1200, risk: 0.35 },
    { name: "Exclusive Service", min: 800, max: 2000, risk: 0.4 },
];

const SLUT_RESPONSES = [
    "You had an amazing night and earned 💰",
    "Your client was very generous! You made 💰",
    "Business is booming! You earned 💰",
    "That was profitable! You received 💰",
    "Your skills paid off! You got 💰",
];

const FAILURE_RESPONSES = [
    "Unfortunately, things didn't go well tonight. You earned nothing.",
    "Your client wasn't satisfied. No payment for you.",
    "It was a slow night. Better luck next time!",
    "Things went wrong and you had to leave empty-handed.",
    "Unfortunately, you got caught and had to run away!",
];

export default {
    data: new SlashCommandBuilder()
        .setName('slut')
        .setDescription('Do risky work to earn money')
        .addStringOption(option =>
            option
                .setName('activity')
                .setDescription('Type of activity to perform')
                .setRequired(false)
                .addChoices(
                    { name: 'Street Walking', value: 'street_walking' },
                    { name: 'Escort Service', value: 'escort_service' },
                    { name: 'Private Party', value: 'private_party' },
                    { name: 'VIP Client', value: 'vip_client' },
                    { name: 'Exclusive Service', value: 'exclusive_service' },
                )
        ),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;

            const userId = interaction.user.id;
            const guildId = interaction.guildId;
            const now = Date.now();

            logger.debug(`[ECONOMY] Slut command started for ${userId}`, { userId, guildId });

            const userData = await getEconomyData(client, guildId, userId);

            if (!userData) {
                throw createError(
                    "Failed to load economy data for slut command",
                    ErrorTypes.DATABASE,
                    "Failed to load your economy data. Please try again later.",
                    { userId, guildId }
                );
            }

            const lastSlut = userData.lastSlut || 0;

            if (now - lastSlut < SLUT_COOLDOWN) {
                const remainingTime = lastSlut + SLUT_COOLDOWN - now;
                logger.warn(`[ECONOMY] Slut cooldown active`, { userId, timeRemaining: remainingTime });
                throw createError(
                    "Slut cooldown active",
                    ErrorTypes.RATE_LIMIT,
                    `You need to wait before you can work again! Try again in **${Math.ceil(remainingTime / 60000)}** minutes.`,
                    { timeRemaining: remainingTime, cooldownType: 'slut' }
                );
            }

            const activityType = interaction.options.getString("activity");
            const activity = activityType 
                ? SLUT_ACTIVITIES.find(a => a.name.toLowerCase().replace(/\s+/g, '_') === activityType)
                : SLUT_ACTIVITIES[Math.floor(Math.random() * SLUT_ACTIVITIES.length)];

            if (!activity) {
                throw createError(
                    "Invalid activity selected",
                    ErrorTypes.VALIDATION,
                    "Please select a valid activity from the choices."
                );
            }

            const success = Math.random() > activity.risk;
            let earnings = 0;

            if (success) {
                earnings = Math.floor(Math.random() * (activity.max - activity.min + 1)) + activity.min;
                
                userData.wallet += earnings;
                userData.lastSlut = now;
                userData.totalSluts = (userData.totalSluts || 0) + 1;
                userData.totalSlutEarnings = (userData.totalSlutEarnings || 0) + earnings;

                await setEconomyData(client, guildId, userId, userData);

                logger.info(`[ECONOMY_TRANSACTION] Slut activity succeeded`, {
                    userId,
                    guildId,
                    activity: activity.name,
                    earnings,
                    newWallet: userData.wallet,
                    timestamp: new Date().toISOString()
                });

                const response = SLUT_RESPONSES[Math.floor(Math.random() * SLUT_RESPONSES.length)];
                const embed = successEmbed(
                    `💰 ${activity.name} - Success!`,
                    `${response} **$${earnings.toLocaleString()}**!\n\n` +
                    `💳 **New Balance:** $${userData.wallet.toLocaleString()}\n` +
                    `📊 **Total Sessions:** ${userData.totalSluts}\n` +
                    `💵 **Total Earnings:** $${userData.totalSlutEarnings.toLocaleString()}`
                );
                await interaction.editReply({ embeds: [embed] });
            } else {
                userData.lastSlut = now;
                userData.totalSluts = (userData.totalSluts || 0) + 1;
                userData.failedSluts = (userData.failedSluts || 0) + 1;

                await setEconomyData(client, guildId, userId, userData);

                logger.info(`[ECONOMY_TRANSACTION] Slut activity failed`, {
                    userId,
                    guildId,
                    activity: activity.name,
                    failedCount: userData.failedSluts,
                    timestamp: new Date().toISOString()
                });

                const response = FAILURE_RESPONSES[Math.floor(Math.random() * FAILURE_RESPONSES.length)];
                const embed = errorEmbed(
                    `❌ ${activity.name} - Failed`,
                    `${response}\n\n` +
                    `💳 **Current Balance:** $${userData.wallet.toLocaleString()}\n` +
                    `📊 **Total Sessions:** ${userData.totalSluts}\n` +
                    `❌ **Failed Sessions:** ${userData.failedSluts}`
                );
                await interaction.editReply({ embeds: [embed] });
            }
    }, { command: 'slut' })
};





