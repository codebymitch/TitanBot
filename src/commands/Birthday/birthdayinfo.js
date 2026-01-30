import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';
import { getGuildBirthdays } from '../../utils/database.js';

/**
 * Calculate days until next birthday
 * @param {number} month - Month (1-12)
 * @param {number} day - Day of month
 * @returns {number} Days until next birthday
 */
function getDaysUntilBirthday(month, day) {
    const today = new Date();
    const currentYear = today.getFullYear();
    
    // Create birthday for this year
    let nextBirthday = new Date(currentYear, month - 1, day);
    
    // If birthday has passed this year, set it for next year
    if (nextBirthday < today) {
        nextBirthday = new Date(currentYear + 1, month - 1, day);
    }
    
    // Calculate difference in days
    const diffTime = Math.abs(nextBirthday - today);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    return diffDays;
}

/**
 * Get the day of the week for a date
 * @param {number} month - Month (1-12)
 * @param {number} day - Day of month
 * @returns {string} Day of the week name
 */
function getDayOfWeek(month, day) {
    const today = new Date();
    const currentYear = today.getFullYear();
    
    // Create birthday for this year
    let nextBirthday = new Date(currentYear, month - 1, day);
    
    // If birthday has passed this year, set it for next year
    if (nextBirthday < today) {
        nextBirthday = new Date(currentYear + 1, month - 1, day);
    }
    
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[nextBirthday.getDay()];
}

/**
 * Format date in a readable way
 * @param {number} month - Month (1-12)
 * @param {number} day - Day of month
 * @returns {string} Formatted date
 */
function formatDate(month, day) {
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 
                   'July', 'August', 'September', 'October', 'November', 'December'];
    return `${months[month - 1]} ${day}${getOrdinalSuffix(day)}`;
}

/**
 * Get ordinal suffix for day (1st, 2nd, 3rd, 4th, etc.)
 * @param {number} day - Day of month
 * @returns {string} Ordinal suffix
 */
function getOrdinalSuffix(day) {
    if (day > 3 && day < 21) return 'th';
    switch (day % 10) {
        case 1: return 'st';
        case 2: return 'nd';
        case 3: return 'rd';
        default: return 'th';
    }
}

// Migrated from: commands/Birthday/birthdayinfo.js
export default {
    data: new SlashCommandBuilder()
        .setName('birthdayinfo')
        .setDescription('Check when a user\'s birthday is and how many days until it')
        .addUserOption((option) =>
            option
                .setName('user')
                .setDescription('The user to check (leave empty to check your own birthday)')
                .setRequired(false),
        ),

    // Command Execution
    async execute(interaction, config, client) {
        // Check if interaction is in a guild
        if (!interaction.guild) {
            return interaction.reply({
                embeds: [
                    errorEmbed(
                        "Guild Command Only",
                        "This command can only be used inside a server.",
                    ),
                ],
                flags: MessageFlags.Ephemeral,
            });
        }

        const targetUser = interaction.options.getUser('user') || interaction.user;
        const guildId = interaction.guildId;
        const userId = targetUser.id;

        try {
            // Get all birthdays for the guild
            const allBirthdays = await getGuildBirthdays(client, guildId);
            
            // Check if user has a birthday registered
            const birthdayData = allBirthdays[userId];
            
            if (!birthdayData) {
                return interaction.reply({
                    embeds: [
                        errorEmbed(
                            "Birthday Not Found",
                            targetUser.id === interaction.user.id 
                                ? "You haven't registered your birthday yet. Use `/birthday register` to set it!"
                                : `${targetUser.username} hasn't registered their birthday yet.`,
                        ),
                    ],
                    flags: MessageFlags.Ephemeral,
                });
            }

            const { month, day } = birthdayData;
            const daysUntil = getDaysUntilBirthday(month, day);
            const dayOfWeek = getDayOfWeek(month, day);
            const formattedDate = formatDate(month, day);

            // Create the embed
            const embed = new EmbedBuilder()
                .setTitle(`🎂 ${targetUser.username}'s Birthday Information`)
                .setDescription(
                    daysUntil === 0 
                        ? `🎉 **Today is ${targetUser.username}'s birthday!** 🎉`
                        : `${targetUser.username}'s next birthday is in **${daysUntil} ${daysUntil === 1 ? 'day' : 'days'}**, on **${formattedDate} (${dayOfWeek})**`
                )
                .setColor(daysUntil === 0 ? "#FFD700" : "#F39C12") // Gold for today, orange for future
                .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
                .setFooter({
                    text: daysUntil === 0 ? "Happy Birthday! 🎂" : "Birthday Information",
                })
                .setTimestamp();

            // Add special celebration if birthday is today
            if (daysUntil === 0) {
                embed.addFields({
                    name: "🎊 Celebration Time!",
                    value: "Don't forget to wish them a happy birthday!",
                    inline: false,
                });
            }

            return interaction.reply({
                embeds: [embed],
                flags: MessageFlags.Ephemeral,
            });

        } catch (error) {
            console.error(`Error getting birthday info for user ${userId} in guild ${guildId}:`, error);
            
            return interaction.reply({
                embeds: [
                    errorEmbed(
                        "Error",
                        "There was an error retrieving the birthday information. Please try again later.",
                    ),
                ],
                flags: MessageFlags.Ephemeral,
            });
        }
    },
};
