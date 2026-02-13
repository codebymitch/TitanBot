import { createEmbed, errorEmbed, successEmbed } from '../../../utils/embeds.js';
import { getGuildBirthdays, getMonthName } from '../../../utils/database.js';

export default {
    async execute(interaction, config, client) {
try {
            const targetUser = interaction.options.getUser("user") || interaction.user;
            const userId = targetUser.id;
            const guildId = interaction.guildId;

            const birthdays = await getGuildBirthdays(client, guildId);
            const birthdayData = birthdays[userId];

            if (!birthdayData) {
                return interaction.reply({
                    embeds: [errorEmbed(
                        "No Birthday Found",
                        targetUser.id === interaction.user.id 
                            ? "You haven't set your birthday yet. Use `/birthday set` to add it!"
                            : `${targetUser.username} hasn't set their birthday yet.`
                    )]
                });
            }

            const monthName = getMonthName(birthdayData.month);
            
            await interaction.editReply({
                embeds: [createEmbed(
                    "🎂 Birthday Information",
                    targetUser.id === interaction.user.id ? "Your Birthday" : `${targetUser.username}'s Birthday`,
                    `**Date:** ${monthName} ${birthdayData.day}\n**User:** ${targetUser.toString()}`,
                    0xff69b4
                )]
            });
        } catch (error) {
            console.error("Birthday info command error:", error);
            await interaction.editReply({
                embeds: [errorEmbed("Error", "Failed to fetch birthday information.")]
            });
        }
    }
};



