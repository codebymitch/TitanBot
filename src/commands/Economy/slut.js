import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';

const SLUT_COOLDOWN = 45 * 60 * 1000; // 45 minutes cooldown
const MIN_SLUT_AMOUNT = 100;
const MAX_SLUT_AMOUNT = 800;
const FAILURE_RATE = 0.25; // 25% chance of failure

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

    async execute(interaction, config, client) {
const userId = interaction.user.id;
        const guildId = interaction.guildId;
        const now = Date.now();

        try {
            const userData = await getEconomyData(client, guildId, userId);
            const lastSlut = userData.lastSlut || 0;

            // Check cooldown
            if (now - lastSlut < SLUT_COOLDOWN) {
                const remainingTime = Math.ceil((SLUT_COOLDOWN - (now - lastSlut)) / 60000);
                return interaction.reply({
                    embeds: [
                        warningEmbed(
                            "⏰ Cooldown Active",
                            `You need to wait ${remainingTime} minutes before you can work again!`
                        )
                    ]
                });
            }

            // Get selected activity or random
            const activityType = interaction.options.getString("activity");
            const activity = activityType 
                ? SLUT_ACTIVITIES.find(a => a.name.toLowerCase().replace(/\s+/g, '_') === activityType)
                : SLUT_ACTIVITIES[Math.floor(Math.random() * SLUT_ACTIVITIES.length)];

            if (!activity) {
                return interaction.editReply({
                    embeds: [
                        errorEmbed(
                            "Invalid Activity",
                            "Please select a valid activity from the choices."
                        )
                    ]
                });
            }

            // Calculate success based on risk
            const success = Math.random() > activity.risk;
            let earnings = 0;

            if (success) {
                // Calculate earnings
                earnings = Math.floor(Math.random() * (activity.max - activity.min + 1)) + activity.min;
                
                // Update user data
                userData.wallet += earnings;
                userData.lastSlut = now;
                userData.totalSluts = (userData.totalSluts || 0) + 1;
                userData.totalSlutEarnings = (userData.totalSlutEarnings || 0) + earnings;

                await setEconomyData(client, guildId, userId, userData);

                // Success response
                const response = SLUT_RESPONSES[Math.floor(Math.random() * SLUT_RESPONSES.length)];
                return interaction.editReply({
                    embeds: [
                        successEmbed(
                            `💰 ${activity.name} - Success!`,
                            `${response} **${earnings.toLocaleString()}** coins!\n\n` +
                            `💳 **New Balance:** ${userData.wallet.toLocaleString()} coins\n` +
                            `📊 **Total Sessions:** ${userData.totalSluts}\n` +
                            `💵 **Total Earnings:** ${userData.totalSlutEarnings.toLocaleString()} coins`
                        )
                    ]
                });
            } else {
                // Failure
                userData.lastSlut = now;
                userData.totalSluts = (userData.totalSluts || 0) + 1;
                userData.failedSluts = (userData.failedSluts || 0) + 1;

                await setEconomyData(client, guildId, userId, userData);

                const response = FAILURE_RESPONSES[Math.floor(Math.random() * FAILURE_RESPONSES.length)];
                return interaction.editReply({
                    embeds: [
                        errorEmbed(
                            `❌ ${activity.name} - Failed`,
                            `${response}\n\n` +
                            `💳 **Current Balance:** ${userData.wallet.toLocaleString()} coins\n` +
                            `📊 **Total Sessions:** ${userData.totalSluts}\n` +
                            `❌ **Failed Sessions:** ${userData.failedSluts}`
                        )
                    ]
                });
            }

        } catch (error) {
            console.error(`Error in slut command for user ${userId}:`, error);
            return interaction.editReply({
                embeds: [
                    errorEmbed(
                        "System Error",
                        "An error occurred while processing your request. Please try again later."
                    )
                ]
            });
        }
    },
};

