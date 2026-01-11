import { SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';

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
// Migrated from: commands/Birthday/birthday.js
export default {
    data: new SlashCommandBuilder()
        .setName('birthday')
        .setDescription('Command description')
        .addSubcommand((subcommand) =>
            subcommand
                .setName("register")
                .setDescription("Set your birthday (month and day only).")
                .addIntegerOption((option) =>
                    option
                        .setName("month")
                        .setDescription(
                            "The month of your birthday (1 for Jan, 12 for Dec).",
                        )
                        .setRequired(true)
                        .setMinValue(1)
                        .setMaxValue(12),
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
                ephemeral: true,
            });
        }

        const guildId = interaction.guildId;
        const userId = interaction.user.id;
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === "register") {
            const month = interaction.options.getInteger("month");
            const day = interaction.options.getInteger("day");

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
                    ephemeral: true,
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
                    ephemeral: true,
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
                    ephemeral: true,
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
                        ephemeral: true,
                    });
                } else {
                    await interaction.reply({
                        embeds: [
                            errorEmbed(
                                "No Birthday Found",
                                "You do not have a registered birthday to remove.",
                            ),
                        ],
                        ephemeral: true,
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
                    ephemeral: true,
                });
            }
        }
    },
};
