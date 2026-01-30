import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed } from '../../utils/embeds.js';
import { getGuildBirthdays } from '../../utils/database.js';
import { getMonthName } from '../../utils/database.js';

export default {
    data: new SlashCommandBuilder()
        .setName('next-birthdays')
        .setDescription('Shows the next 5 upcoming birthdays in the server')
        .setDMPermission(false),

    async execute(interaction, config, client) {
        try {
            await interaction.deferReply();

            const guildId = interaction.guild.id;
            const birthdays = await getGuildBirthdays(client, guildId);

            if (!birthdays || Object.keys(birthdays).length === 0) {
                return await interaction.editReply({
                    embeds: [
                        errorEmbed(
                            'No Birthdays Found',
                            'No birthdays have been set up in this server yet. Use `/birthday set` to add birthdays!'
                        )
                    ]
                });
            }

            const today = new Date();
            const currentYear = today.getFullYear();
            const upcomingBirthdays = [];

            for (const [userId, birthdayData] of Object.entries(birthdays)) {
                if (!birthdayData.month || !birthdayData.day) continue;

                let birthday = new Date(currentYear, birthdayData.month - 1, birthdayData.day);
                
                if (birthday < today) {
                    birthday = new Date(currentYear + 1, birthdayData.month - 1, birthdayData.day);
                }

                const daysUntil = Math.floor((birthday - today) / (1000 * 60 * 60 * 24));
                
                upcomingBirthdays.push({
                    userId,
                    month: birthdayData.month,
                    day: birthdayData.day,
                    daysUntil,
                    date: birthday,
                    age: currentYear - (birthdayData.year || currentYear)
                });
            }

            upcomingBirthdays.sort((a, b) => a.daysUntil - b.daysUntil);
            const nextFive = upcomingBirthdays.slice(0, 5);

            if (nextFive.length === 0) {
                return await interaction.editReply({
                    embeds: [
                        errorEmbed(
                            'No Upcoming Birthdays',
                            'No upcoming birthdays found in the next year.'
                        )
                    ]
                });
            }

            const embed = createEmbed(
                '🎂 Next 5 Upcoming Birthdays',
                `Here are the next 5 birthdays in **${interaction.guild.name}**:`
            );

            for (const birthday of nextFive) {
                try {
                    const user = await client.users.fetch(birthday.userId);
                    const username = user.username;
                    const mention = `<@${birthday.userId}>`;
                    
                    let timeUntil;
                    if (birthday.daysUntil === 0) {
                        timeUntil = '🎉 **Today!**';
                    } else if (birthday.daysUntil === 1) {
                        timeUntil = '🎊 **Tomorrow!**';
                    } else if (birthday.daysUntil <= 7) {
                        timeUntil = `In ${birthday.daysUntil} days`;
                    } else if (birthday.daysUntil <= 30) {
                        timeUntil = `In ${Math.floor(birthday.daysUntil / 7)} week${Math.floor(birthday.daysUntil / 7) > 1 ? 's' : ''}`;
                    } else {
                        timeUntil = `In ${Math.floor(birthday.daysUntil / 30)} month${Math.floor(birthday.daysUntil / 30) > 1 ? 's' : ''}`;
                    }

                    embed.addFields({
                        name: `${getMonthName(birthday.month)} ${birthday.day}`,
                        value: `${mention} (${username})\n${timeUntil}`,
                        inline: false
                    });
                } catch (error) {
                    embed.addFields({
                        name: `${getMonthName(birthday.month)} ${birthday.day}`,
                        value: `Unknown User (${birthday.userId})\nIn ${birthday.daysUntil} days`,
                        inline: false
                    });
                }
            }

            embed.setFooter({
                text: `Total birthdays in server: ${Object.keys(birthdays).length} | Showing next 5`
            });

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Error in next-birthdays command:', error);
            await interaction.editReply({
                embeds: [
                    errorEmbed(
                        'Error',
                        'An error occurred while fetching upcoming birthdays. Please try again later.'
                    )
                ]
            });
        }
    }
};
