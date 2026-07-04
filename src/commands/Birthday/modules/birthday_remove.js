import { EmbedBuilder } from 'discord.js';
import { deleteBirthday } from '../../../services/birthdayService.js';
import { logger } from '../../../utils/logger.js';
import { handleInteractionError } from '../../../utils/errorHandler.js';

import { InteractionHelper } from '../../../utils/interactionHelper.js';
export default {
    async execute(interaction, config, client) {
        try {
            await InteractionHelper.safeDefer(interaction);

            const userId = interaction.user.id;
            const guildId = interaction.guildId;

            const result = await deleteBirthday(client, guildId, userId);

            if (result.success) {
                const embed = new EmbedBuilder()
                    .setColor(0x00FF00)
                    .setTitle('Birthday Removed')
                    .setDescription('Your birthday has been successfully removed from the server.');
                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [embed]
                });
            } else if (result.notFound) {
                const embed = new EmbedBuilder()
                    .setColor(0xFF0000)
                    .setTitle('No Birthday Found')
                    .setDescription('You don\'t have a birthday set to remove.');
                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [embed]
                });
            }
        } catch (error) {
            logger.error("Birthday remove command execution failed", {
                error: error.message,
                stack: error.stack,
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'birthday_remove'
            });
            await handleInteractionError(interaction, error, {
                commandName: 'birthday_remove',
                source: 'birthday_remove_module'
            });
        }
    }
};