import { EmbedBuilder } from 'discord.js';
import { getUpcomingBirthdays } from '../../../services/birthdayService.js';
import { deleteBirthday } from '../../../utils/database.js';
import { logger } from '../../../utils/logger.js';
import { handleInteractionError } from '../../../utils/errorHandler.js';

import { InteractionHelper } from '../../../utils/interactionHelper.js';
export default {
    async execute(interaction, config, client) {
        try {
            await InteractionHelper.safeDefer(interaction);

            const next5 = await getUpcomingBirthdays(client, interaction.guildId, 5);

            if (next5.length === 0) {
                const embed = new EmbedBuilder()
                    .setColor(0xFF0000)
                    .setTitle('No Birthdays Found')
                    .setDescription('No birthdays have been set up in this server yet. Use `/birthday set` to add birthdays!');
                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [embed]
                });
            }

            let displayIndex = 0;
            for (const birthday of next5) {
                const member = await interaction.guild.members.fetch(birthday.userId).catch(() => null);
                if (!member) {
                    deleteBirthday(client, interaction.guildId, birthday.userId).catch(() => null);
                    continue;
                }
                displayIndex++;

                let timeUntil = '';
                if (birthday.daysUntil === 0) {
                    timeUntil = '🎉 **Today!**';
                } else if (birthday.daysUntil === 1) {
                    timeUntil = '📅 **Tomorrow!**';
                } else {
                    timeUntil = `In ${birthday.daysUntil} day${birthday.daysUntil > 1 ? 's' : ''}`;
                }
            }

            if (displayIndex === 0) {
                const embed = new EmbedBuilder()
                    .setColor(0xFF0000)
                    .setTitle('No Upcoming Birthdays')
                    .setDescription('No upcoming birthdays found for current server members.');
                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [embed]
                });
            }

            let birthdayList = `🎂 **Next 5 Upcoming Birthdays**\n\nHere are the next 5 birthdays in ${interaction.guild.name}:\n\n`;
            displayIndex = 0;
            for (const birthday of next5) {
                const member = await interaction.guild.members.fetch(birthday.userId).catch(() => null);
                if (!member) {
                    continue;
                }
                displayIndex++;

                let timeUntil = '';
                if (birthday.daysUntil === 0) {
                    timeUntil = '🎉 **Today!**';
                } else if (birthday.daysUntil === 1) {
                    timeUntil = '📅 **Tomorrow!**';
                } else {
                    timeUntil = `In ${birthday.daysUntil} day${birthday.daysUntil > 1 ? 's' : ''}`;
                }

                birthdayList += `${displayIndex}. **${member.displayName}**\n<@${birthday.userId}>\n📅 **Date:** ${birthday.monthName} ${birthday.day}\n⏰ **Time:** ${timeUntil}\n\n`;
            }

            birthdayList += `Use /birthday set to add your birthday!`;

            const embed = new EmbedBuilder()
                .setColor(0x00FF00)
                .setTitle('Next 5 Upcoming Birthdays')
                .setDescription(birthdayList);

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [embed]
            });
            
            logger.info('Next birthdays retrieved successfully', {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                upcomingCount: displayIndex,
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