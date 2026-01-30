import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';
import { getEconomyData, setEconomyData } from '../../services/economy.js';
import { botConfig } from '../../config/bot.js';

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
    // Slash command data
    data: new SlashCommandBuilder()
        .setName("crime")
        .setDescription("Commit a crime for a chance to earn big money")
        .addStringOption(option =>
            option
                .setName("type")
                .setDescription("Type of crime to commit")
                .setRequired(false)
                .addChoices(
                    { name: "Pickpocketing", value: "pickpocketing" },
                    { name: "Burglary", value: "burglary" },
                    { name: "Bank Heist", value: "bank_heist" },
                    { name: "Art Theft", value: "art_theft" },
                    { name: "Cybercrime", value: "cybercrime" }
                )
        ),
    
    // Prefix command data
    name: "crime",
    aliases: ["steal", "rob", "heist"],
    description: "Commit a crime for a chance to earn big money",
    category: "Economy",
    usage: `${botConfig.commands.prefix}crime [type]`,
    cooldown: 60, // 1 hour

    // Slash command execution
    async execute(interaction, config, client) {
        await interaction.deferReply();

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

    // Prefix command execution
    async executeMessage(message, args, client) {
        const userId = message.author.id;
        const guildId = message.guild.id;
        const now = Date.now();

        try {
            const userData = await getEconomyData(client, guildId, userId);
            const lastCrime = userData.cooldowns?.crime || 0;

            // Check if user is in jail
            if (userData.jailedUntil && userData.jailedUntil > now) {
                const remainingTime = Math.ceil((userData.jailedUntil - now) / (1000 * 60));
                return message.reply({
                    embeds: [
                        errorEmbed(
                            "In Jail",
                            `You are currently in jail for ${remainingTime} more minutes.`
                        ),
                    ],
                });
            }

            // Check cooldown
            if (lastCrime + CRIME_COOLDOWN > now) {
                const remainingTime = Math.ceil((lastCrime + CRIME_COOLDOWN - now) / (1000 * 60));
                return message.reply({
                    embeds: [
                        errorEmbed(
                            "Crime Cooldown",
                            `You need to wait ${remainingTime} minutes before attempting another crime.`
                        ),
                    ],
                });
            }

            // Get crime type from args or random
            let crimeType = args[0]?.toLowerCase();
            let crime;

            if (crimeType) {
                // Find crime by name
                crime = CRIME_TYPES.find(c => 
                    c.name.toLowerCase().replace(/\s+/g, '-') === crimeType ||
                    c.name.toLowerCase().includes(crimeType)
                );
            }

            if (!crime) {
                // Random crime if not specified or not found
                crime = CRIME_TYPES[Math.floor(Math.random() * CRIME_TYPES.length)];
            }

            // Calculate success
            const success = Math.random() > crime.risk;
            let amountEarned = Math.floor(Math.random() * (crime.max - crime.min + 1)) + crime.min;

            // Update cooldown
            if (!userData.cooldowns) userData.cooldowns = {};
            userData.cooldowns.crime = now;

            if (success) {
                // Successful crime
                userData.wallet = (userData.wallet || 0) + amountEarned;
                await setEconomyData(client, guildId, userId, userData);

                const embed = successEmbed(
                    "Crime Successful!",
                    `You successfully committed ${crime.name} and earned ${amountEarned} coins!`
                ).addFields({
                    name: "💰 New Balance",
                    value: `${userData.wallet.toLocaleString()} coins`,
                    inline: true,
                });

                await message.reply({ embeds: [embed] });
            } else {
                // Failed the crime - go to jail
                const fine = Math.floor(amountEarned * 0.2);
                userData.wallet = Math.max(0, (userData.wallet || 0) - fine);
                userData.jailedUntil = now + JAIL_TIME;
                
                await setEconomyData(client, guildId, userId, userData);

                await message.reply({
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
            await message.reply({
                embeds: [errorEmbed("Error", "An error occurred while processing your crime.")],
            });
        }
    }
};
