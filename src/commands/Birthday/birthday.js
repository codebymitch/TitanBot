import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';
import { getGuildBirthdays, setBirthday } from '../../utils/database.js';

const MONTHS = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
];

/**
 * Parse month input from various formats (full name, abbreviation, or number)
 * @param {string} monthInput - The month input from user
 * @returns {number|null} The month number (1-12) or null if invalid
 */
function parseMonthInput(monthInput) {
    if (!monthInput) return null;
    
    // If it's already a number from choices, use it directly
    if (!isNaN(parseInt(monthInput))) {
        const num = parseInt(monthInput);
        return num >= 1 && num <= 12 ? num : null;
    }
    
    // Handle string input (full month names or abbreviations)
    const monthMap = {
        'january': 1, 'jan': 1,
        'february': 2, 'feb': 2,
        'march': 3, 'mar': 3,
        'april': 4, 'apr': 4,
        'may': 5,
        'june': 6, 'jun': 6,
        'july': 7, 'jul': 7,
        'august': 8, 'aug': 8,
        'september': 9, 'sep': 9,
        'october': 10, 'oct': 10,
        'november': 11, 'nov': 11,
        'december': 12, 'dec': 12
    };
    
    return monthMap[monthInput.toLowerCase()] || null;
}
// Migrated from: commands/Birthday/birthday.js
export default {
    data: new SlashCommandBuilder()
        .setName('birthday')
        .setDescription('Command description')
        .addSubcommand((subcommand) =>
            subcommand
                .setName("register")
                .setDescription("Set your birthday (month and day only).")
                .addStringOption((option) =>
                    option
                        .setName("month")
                        .setDescription(
                            "The month of your birthday (e.g., January, Jan, 1).",
                        )
                        .setRequired(true)
                        .addChoices(
                            { name: "January (Jan)", value: "1" },
                            { name: "February (Feb)", value: "2" },
                            { name: "March (Mar)", value: "3" },
                            { name: "April (Apr)", value: "4" },
                            { name: "May", value: "5" },
                            { name: "June (Jun)", value: "6" },
                            { name: "July (Jul)", value: "7" },
                            { name: "August (Aug)", value: "8" },
                            { name: "September (Sep)", value: "9" },
                            { name: "October (Oct)", value: "10" },
                            { name: "November (Nov)", value: "11" },
                            { name: "December (Dec)", value: "12" },
                        ),
                )
                .addIntegerOption((option) =>
                    option
                        .setName("day")
                        .setDescription("The day of the month.")
                        .setRequired(true)
                        .setMinValue(1)
                        .setMaxValue(31),
                ),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("remove")
                .setDescription("Remove your registered birthday."),
        ),

    // Command Execution
    async execute(interaction, guildConfig, client) {
        if (!interaction.inGuild()) {
            return interaction.reply({
                embeds: [
                    errorEmbed(
                        "Guild Command Only",
                        "This command can only be used inside a server.",
                    ),
                ],
                flags: ["Ephemeral"],
            });
        }

        const guildId = interaction.guildId;
        const userId = interaction.user.id;
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === "register") {
            const monthInput = interaction.options.getString("month");
            const day = interaction.options.getInteger("day");

            // Parse month input using helper function
            const month = parseMonthInput(monthInput);
            
            if (!month) {
                return interaction.reply({
                    embeds: [
                        errorEmbed(
                            "Invalid Month",
                            "Please enter a valid month name (e.g., January, Jan) or number (1-12).",
                        ),
                    ],
                    flags: ["Ephemeral"],
                });
            }

            // Simple validation for day based on month (doesn't check leap years)
            const daysInMonth = new Date(2000, month, 0).getDate(); // Get days in month (using 2000 as a non-leap year base, though 0 is the key)

            if (day > daysInMonth) {
                return interaction.reply({
                    embeds: [
                        errorEmbed(
                            "Invalid Day",
                            `The month of ${MONTHS[month - 1]} only has ${daysInMonth} days. Please check the day you entered.`,
                        ),
                    ],
                    flags: ["Ephemeral"],
                });
            }

            try {
                // Save the birthday to the database
                await setBirthday(client, guildId, userId, month, day);

                await interaction.reply({
                    embeds: [
                        successEmbed(
                            "🎂 Birthday Registered!",
                            `I have successfully set your birthday to **${day} ${MONTHS[month - 1]}**.`,
                        ),
                    ],
                    flags: ["Ephemeral"],
                });
            } catch (error) {
                console.error(
                    `Error setting birthday for ${userId} in ${guildId}:`,
                    error,
                );
                await interaction.reply({
                    embeds: [
                        errorEmbed(
                            "Registration Failed",
                            "I couldn't save your birthday due to a database error.",
                        ),
                    ],
                    flags: ["Ephemeral"],
                });
            }
        }

        if (subcommand === "remove") {
            try {
                const wasDeleted = await deleteBirthday(
                    client,
                    guildId,
                    userId,
                );

                if (wasDeleted) {
                    await interaction.reply({
                        embeds: [
                            successEmbed(
                                "Birthday Removed",
                                "Your birthday has been successfully removed from the server registry.",
                            ),
                        ],
                        flags: ["Ephemeral"],
                    });
                } else {
                    await interaction.reply({
                        embeds: [
                            errorEmbed(
                                "No Birthday Found",
                                "You do not have a registered birthday to remove.",
                            ),
                        ],
                        flags: ["Ephemeral"],
                    });
                }
            } catch (error) {
                console.error(
                    `Error deleting birthday for ${userId} in ${guildId}:`,
                    error,
                );
                await interaction.reply({
                    embeds: [
                        errorEmbed(
                            "Removal Failed",
                            "I couldn't remove your birthday due to a database error.",
                        ),
                    ],
                    flags: ["Ephemeral"],
                });
            }
        }
    },
};
