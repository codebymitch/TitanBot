import { EmbedBuilder } from 'discord.js';
import { getUserBirthday } from '../../../services/birthdayService.js';
import { logger } from '../../../utils/logger.js';
import { handleInteractionError } from '../../../utils/errorHandler.js';

import { InteractionHelper } from '../../../utils/interactionHelper.js';
export default {
    async execute(interaction, config, client) {
        try {
            await InteractionHelper.safeDefer(interaction);

            const targetUser = interaction.options.getUser("user") || interaction.user;
            const userId = targetUser.id;
            const guildId = interaction.guildId;

            const birthdayData = await getUserBirthday(client, guildId, userId);

            if (!birthdayData) {
                const embed = new EmbedBuilder()
                    .setColor(0xFF0000)
                    .setTitle('No Birthday Found')
                    .setDescription(targetUser.id === interaction.user.id 
                        ? "You haven't set your birthday yet. Use `/birthday set` to add it!"
                        : `${targetUser.username} hasn't set their birthday yet.`);
                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [embed]
                });
            }
            
            const embed = new EmbedBuilder()
                .setColor(0x00FF00)
                .setTitle('Birthday Information')
                .setDescription(`**Date:** ${birthdayData.monthName} ${birthdayData.day}\n**User:** ${targetUser.toString()}`);
            
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [embed]
            });
            
            logger.info('Birthday info retrieved successfully', {
                userId: interaction.user.id,
                targetUserId: targetUser.id,
                guildId,
                commandName: 'birthday_info'
            });
        } catch (error) {
            logger.error("Birthday info command execution failed", {
                error: error.message,
                stack: error.stack,
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'birthday_info'
            });
            await handleInteractionError(interaction, error, {
                commandName: 'birthday_info',
                source: 'birthday_info_module'
            });
        }
    }
};