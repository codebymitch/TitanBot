import { MessageFlags } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed } from '../../../utils/embeds.js';
import { getUpcomingBirthdays } from '../../../services/birthdayService.js';
import { logger } from '../../../utils/logger.js';
import { handleInteractionError } from '../../../utils/errorHandler.js';

export default {
    async execute(interaction, config, client) {
        try {
            await interaction.deferReply();
            
            
            const next5 = await getUpcomingBirthdays(client, interaction.guildId, 5);

            if (next5.length === 0) {
                return await interaction.editReply({
                    embeds: [
                        createEmbed({
                            title: '❌ No Birthdays Found',
                            description: 'No birthdays have been set up in this server yet. Use `/birthday set` to add birthdays!',
                            color: 'error'
                        })
                    ]
                });
            }

            const embed = createEmbed({
                title: '🎂 Next 5 Upcoming Birthdays',
                description: `Here are the next 5 birthdays in ${interaction.guild.name}:`,
                color: 'info'
            });

            for (let i = 0; i < next5.length; i++) {
                const birthday = next5[i];
                const member = await interaction.guild.members.fetch(birthday.userId).catch(() => null);
                const userName = member ? member.user.username : `User ${birthday.userId}`;
                
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
                    value: `📅 **Date:** ${birthday.monthName} ${birthday.day}\n⏰ **Time:** ${timeUntil}`,
                    inline: false
                });
            }

            embed.setFooter({
                text: 'Use /birthday set to add your birthday!',
                iconURL: interaction.guild.iconURL()
            });

            await interaction.editReply({ embeds: [embed] });
            
            logger.info('Next birthdays retrieved successfully', {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                upcomingCount: next5.length,
                commandName: 'next_birthdays'
            });
        } catch (error) {
            logger.error('Next birthdays command execution failed', {
                error: error.message,
                stack: error.stack,
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'next_birthdays'
            });
            await handleInteractionError(interaction, error, {
                commandName: 'next_birthdays',
                source: 'next_birthdays_module'
            });
        }
    }
};



