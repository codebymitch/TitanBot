import { MessageFlags } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed } from '../../../utils/embeds.js';
import { getAllBirthdays } from '../../../services/birthdayService.js';
import { logger } from '../../../utils/logger.js';
import { handleInteractionError } from '../../../utils/errorHandler.js';

import { InteractionHelper } from '../../../utils/interactionHelper.js';
export default {
    async execute(interaction, config, client) {
        try {
            await InteractionHelper.safeDefer(interaction);

            const guildId = interaction.guildId;
            
            
            const sortedBirthdays = await getAllBirthdays(client, guildId);

            if (sortedBirthdays.length === 0) {
                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [createEmbed({
                        title: '❌ No Birthdays',
                        description: 'No birthdays have been set in this server yet.',
                        color: 'error'
                    })]
                });
            }

            const embed = createEmbed({
                title: "🎂 Server Birthdays",
                color: 'info'
            });

            let birthdayList = `**${sortedBirthdays.length} birthdays in ${interaction.guild.name}**\n\n`;
            sortedBirthdays.forEach((birthday, index) => {
                const member = interaction.guild.members.cache.get(birthday.userId);
                const userName = member ? member.user.username : `User ${birthday.userId}`;
                birthdayList += `${index + 1}. **${userName}** - ${birthday.monthName} ${birthday.day}\n`;
            });

            embed.setDescription(birthdayList || "No birthdays found");
            embed.setFooter({ text: `Total: ${sortedBirthdays.length} birthdays` });

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
            
            logger.info('Birthday list retrieved successfully', {
                userId: interaction.user.id,
                guildId,
                birthdayCount: sortedBirthdays.length,
                commandName: 'birthday_list'
            });
        } catch (error) {
            logger.error("Birthday list command execution failed", {
                error: error.message,
                stack: error.stack,
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'birthday_list'
            });
            await handleInteractionError(interaction, error, {
                commandName: 'birthday_list',
                source: 'birthday_list_module'
            });
        }
    }
};



