import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';
import { deleteBirthday } from '../../utils/database.js';

// Migrated from: commands/Birthday/forgot-birthday.js
export default {
    data: new SlashCommandBuilder()
        .setName('forgot-birthday')
        .setDescription('Remove your birthday from the system (if you forgot it or want to change it).'),

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
                            "🎂 Birthday Forgotten",
                            "I've removed your birthday from the system. You can register a new one anytime using `/birthday register`!",
                        ),
                    ],
                    flags: ["Ephemeral"],
                });
            } else {
                await interaction.reply({
                    embeds: [
                        infoEmbed(
                            "No Birthday Found",
                            "You don't have a birthday registered in the system. If you'd like to add one, use `/birthday register`!",
                        ),
                    ],
                    flags: ["Ephemeral"],
                });
            }
        } catch (error) {
            console.error(
                `Error forgetting birthday for ${userId} in ${guildId}:`,
                error,
            );
            await interaction.reply({
                embeds: [
                    errorEmbed(
                        "Operation Failed",
                        "I couldn't process your request due to a database error.",
                    ),
                ],
                flags: ["Ephemeral"],
            });
        }
    },
};
