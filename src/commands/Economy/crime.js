import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';

const CRIME_COOLDOWN = 60 * 60 * 1000; // 1 hour cooldown
const MIN_CRIME_AMOUNT = 100;
const MAX_CRIME_AMOUNT = 2000;
const FAILURE_RATE = 0.4; // 40% chance of failure
const JAIL_TIME = 2 * 60 * 60 * 1000; // 2 hours jail time on failure

const CRIME_TYPES = [
    { name: "Pickpocketing", min: 100, max: 500, risk: 0.3 },
    { name: "Burglary", min: 300, max: 1000, risk: 0.4 },
    { name: "Bank Heist", min: 1000, max: 5000, risk: 0.6 },
    { name: "Art Theft", min: 2000, max: 10000, risk: 0.7 },
    { name: "Cybercrime", min: 5000, max: 20000, risk: 0.8 },
];

export default {
    data: new SlashCommandBuilder()
        .setName('crime')
        .setDescription('Commit a crime to earn money (risky)')
        .addStringOption(option =>
            option
                .setName('type')
                .setDescription('Type of crime to commit')
                .setRequired(true)
                .addChoices(
                    { name: 'Pickpocketing', value: 'pickpocketing' },
                    { name: 'Burglary', value: 'burglary' },
                    { name: 'Bank Heist', value: 'bank-heist' },
                    { name: 'Art Theft', value: 'art-theft' },
                    { name: 'Cybercrime', value: 'cybercrime' },
                )
        ),

    async execute(interaction, config, client) {
        const userId = interaction.user.id;
        const guildId = interaction.guildId;
        const now = Date.now();

        try {
            const userData = await getEconomyData(client, guildId, userId);
            const lastCrime = userData.cooldowns?.crime || 0;
            const isJailed = userData.jailedUntil && userData.jailedUntil > now;

            // Check if user is in jail
            if (isJailed) {
                const timeLeft = Math.ceil((userData.jailedUntil - now) / (1000 * 60));
                return interaction.editReply({
                    embeds: [
                        errorEmbed(
                            "Jail Time",
                            `You're in jail for ${timeLeft} more minutes!`
                        ),
                    ],
                });
            }

            // Check cooldown
            if (now < lastCrime + CRIME_COOLDOWN) {
                const timeLeft = Math.ceil((lastCrime + CRIME_COOLDOWN - now) / (1000 * 60));
                return interaction.editReply({
                    embeds: [
                        errorEmbed(
                            "Cooldown Active",
                            `You need to wait ${timeLeft} more minutes before committing another crime.`
                        ),
                    ],
                });
            }

            const crimeType = interaction.options.getString("type").toLowerCase();
            const crime = CRIME_TYPES.find(
                c => c.name.toLowerCase().replace(/\s+/g, '-') === crimeType
            );

            if (!crime) {
                return interaction.editReply({
                    embeds: [errorEmbed("Invalid Crime", "Please select a valid crime type.")],
                });
            }

            // Calculate success/failure
            const isSuccess = Math.random() > crime.risk;
            const amountEarned = isSuccess
                ? Math.floor(Math.random() * (crime.max - crime.min + 1)) + crime.min
                : 0;

            // Update user data
            userData.cooldowns = userData.cooldowns || {};
            userData.cooldowns.crime = now;

            if (isSuccess) {
                userData.wallet = (userData.wallet || 0) + amountEarned;
                
                await setEconomyData(client, guildId, userId, userData);
                
                return interaction.editReply({
                    embeds: [
                        successEmbed(
                            "Crime Successful!",
                            `You successfully committed ${crime.name} and earned **${amountEarned}** coins!`
                        ),
                    ],
                });
            } else {
                // Failed the crime - go to jail
                const fine = Math.floor(amountEarned * 0.2);
                userData.wallet = Math.max(0, (userData.wallet || 0) - fine);
                userData.jailedUntil = now + JAIL_TIME;
                
                await setEconomyData(client, guildId, userId, userData);
                
                return interaction.editReply({
                    embeds: [
                        errorEmbed(
                            "Crime Failed!",
                            `You were caught while attempting ${crime.name} and have been sent to jail! ` +
                            `You were fined ${fine} coins and will be in jail for 2 hours.`
                        ),
                    ],
                });
            }
        } catch (error) {
            console.error("Error in crime command:", error);
            return interaction.editReply({
                embeds: [errorEmbed("Error", "An error occurred while processing your crime.")],
            });
        }
    },
};

