import { createEmbed, errorEmbed, successEmbed } from '../../../utils/embeds.js';
import { getGuildBirthdays, getMonthName } from '../../../utils/database.js';

export default {
    async execute(interaction, config, client) {
try {
            const birthdays = await getGuildBirthdays(client, interaction.guildId);

            if (!birthdays || Object.keys(birthdays).length === 0) {
                return interaction.reply({
                    embeds: [
                        errorEmbed(
                            'No Birthdays Found',
                            'No birthdays have been set up in this server yet. Use `/birthday set` to add birthdays!'
                        )
                    ]
                });
            }

            // Get current date
            const today = new Date();
            const currentYear = today.getFullYear();

            // Convert birthdays to array and sort by next occurrence
            const upcomingBirthdays = [];
            
            for (const [userId, userData] of Object.entries(birthdays)) {
                let nextBirthday = new Date(currentYear, userData.month - 1, userData.day);
                
                // If birthday has already passed this year, use next year
                if (nextBirthday < today) {
                    nextBirthday = new Date(currentYear + 1, userData.month - 1, userData.day);
                }
                
                upcomingBirthdays.push({
                    userId,
                    month: userData.month,
                    day: userData.day,
                    date: nextBirthday,
                    daysUntil: Math.ceil((nextBirthday - today) / (1000 * 60 * 60 * 24))
                });
            }

            // Sort by days until birthday
            upcomingBirthdays.sort((a, b) => a.daysUntil - b.daysUntil);

            // Take only the next 5
            const next5 = upcomingBirthdays.slice(0, 5);

            if (next5.length === 0) {
                return interaction.editReply({
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
                `Here are the next 5 birthdays in ${interaction.guild.name}:`
            );

            for (let i = 0; i < next5.length; i++) {
                const birthday = next5[i];
                const member = await interaction.guild.members.fetch(birthday.userId).catch(() => null);
                const userName = member ? member.user.username : `User ${birthday.userId}`;
                const monthName = getMonthName(birthday.month);
                
                let timeUntil = '';
                if (birthday.daysUntil === 0) {
                    timeUntil = '🎉 **Today!**';
                } else if (birthday.daysUntil === 1) {
                    timeUntil = '📅 **Tomorrow!**';
                } else {
                    timeUntil = `In ${birthday.daysUntil} day${birthday.daysUntil > 1 ? 's' : ''}`;
                }

                embed.addFields({
                    name: `${i + 1}. ${userName}`,
                    value: `📅 **Date:** ${monthName} ${birthday.day}\n⏰ **Time:** ${timeUntil}`,
                    inline: false
                });
            }

            embed.setFooter({
                text: 'Use /birthday set to add your birthday!',
                iconURL: interaction.guild.iconURL()
            });

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Next birthdays command error:', error);
            await interaction.editReply({ embeds: [errorEmbed('Error', 'Failed to fetch upcoming birthdays.')] });
        }
    }
};
