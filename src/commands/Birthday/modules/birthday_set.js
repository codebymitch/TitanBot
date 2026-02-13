import { createEmbed, errorEmbed, successEmbed } from '../../../utils/embeds.js';
import { getGuildBirthdays, setBirthday, deleteBirthday, getMonthName } from '../../../utils/database.js';

export default {
    async execute(interaction, config, client) {
try {
            const month = interaction.options.getInteger("month");
            const day = interaction.options.getInteger("day");
            const userId = interaction.user.id;
            const guildId = interaction.guildId;

            const currentYear = new Date().getFullYear();
            const date = new Date(currentYear, month - 1, day);
            
            if (isNaN(date.getTime()) || date.getMonth() !== month - 1 || date.getDate() !== day) {
                return interaction.reply({
                    embeds: [errorEmbed("Invalid Date", "Please enter a valid date (e.g., February 29th only exists in leap years).")]
                });
            }

            const success = await setBirthday(client, guildId, userId, month, day);
            
            if (success) {
                const monthName = getMonthName(month);
                await interaction.editReply({
                    embeds: [successEmbed(
                        "Birthday Set! 🎂",
                        `Your birthday has been set to **${monthName} ${day}**!`
                    )]
                });
            } else {
                await interaction.editReply({
                    embeds: [errorEmbed("Error", "Failed to set your birthday. Please try again.")]
                });
            }
        } catch (error) {
            console.error("Birthday command error:", error);
            await interaction.editReply({
                embeds: [errorEmbed("Error", "An error occurred while setting your birthday.")]
            });
        }
    }
};



