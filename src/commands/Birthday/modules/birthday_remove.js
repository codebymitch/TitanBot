import { MessageFlags } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed } from '../../../utils/embeds.js';
import { deleteBirthday } from '../../../services/birthdayService.js';
import { logger } from '../../../utils/logger.js';
import { handleInteractionError } from '../../../utils/errorHandler.js';

export default {
    async execute(interaction, config, client) {
        try {
            await interaction.deferReply();

            const userId = interaction.user.id;
            const guildId = interaction.guildId;

            // Use service layer
            const result = await deleteBirthday(client, guildId, userId);

            if (result.success) {
                await interaction.editReply({
                    embeds: [successEmbed(
                        "Your birthday has been successfully removed from the server.",
                        "Birthday Removed 🗑️"
                    )]
                });
            } else if (result.notFound) {
                await interaction.editReply({
                    embeds: [createEmbed({
                        title: '❌ No Birthday Found',
                        description: "You don't have a birthday set to remove.",
                        color: 'error'
                    })]
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



