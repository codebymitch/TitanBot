import { MessageFlags } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed } from '../../../utils/embeds.js';
import { setBirthday } from '../../../services/birthdayService.js';
import { logger } from '../../../utils/logger.js';
import { handleInteractionError } from '../../../utils/errorHandler.js';

import { InteractionHelper } from '../../../utils/interactionHelper.js';
export default {
    async execute(interaction, config, client) {
        try {
            await InteractionHelper.safeDefer(interaction);

            const month = interaction.options.getInteger("month");
            const day = interaction.options.getInteger("day");
            const userId = interaction.user.id;
            const guildId = interaction.guildId;

            
            const result = await setBirthday(client, guildId, userId, month, day);
            
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [successEmbed(
                    `Your birthday has been set to **${result.data.monthName} ${result.data.day}**!`,
                    "Birthday Set! 🎂"
                )]
            });
        } catch (error) {
            logger.error("Birthday set command execution failed", {
                error: error.message,
                stack: error.stack,
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'birthday_set'
            });
            await handleInteractionError(interaction, error, {
                commandName: 'birthday_set',
                source: 'birthday_set_module'
            });
        }
    }
};



