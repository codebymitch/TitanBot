import { SlashCommandBuilder } from 'discord.js';
import { successEmbed, errorEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getFromDb, setInDb } from '../../utils/database.js';

export default {
    data: new SlashCommandBuilder()
        .setName("editafk")
        .setDescription("Edit or remove your AFK status")
        .addStringOption((option) =>
            option
                .setName("message")
                .setDescription("New AFK message (leave empty to remove AFK)")
                .setRequired(false)
        ),
    category: "utility",

    async execute(interaction) {
        try {
            const deferSuccess = await InteractionHelper.safeDefer(interaction);
            if (!deferSuccess) {
                logger.warn(`EditAFK interaction defer failed`, {
                    userId: interaction.user.id,
                    guildId: interaction.guildId,
                    commandName: 'editafk'
                });
                return;
            }

            const newMessage = interaction.options.getString("message");
            const userId = interaction.user.id;
            const guildId = interaction.guildId;
            const afkKey = `afk:${guildId}:${userId}`;

            // Check if user is AFK
            const currentAFK = await getFromDb(afkKey);
            if (!currentAFK) {
                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed('Not AFK', 'You are not currently AFK. Use /afk to set your status.')]
                });
            }

            if (!newMessage) {
                // Remove AFK status
                await InteractionHelper.delete(afkKey);

                // Remove [AFK] from nickname
                try {
                    if (interaction.member?.nickname?.includes('[AFK]')) {
                        const newNick = interaction.member.nickname.replace('[AFK] ', '');
                        await interaction.member.setNickname(newNick);
                    }
                } catch (err) {
                    logger.warn('Could not update nickname for AFK removal:', err.message);
                }

                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [successEmbed('💤 AFK Removed', 'You are no longer AFK!')]
                });
            } else {
                // Update AFK message
                const afkData = {
                    userId,
                    guildId,
                    message: newMessage,
                    timestamp: Date.now(),
                    username: interaction.user.username
                };

                await setInDb(afkKey, afkData);

                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [
                        successEmbed(
                            '💤 AFK Updated',
                            `New message: **${newMessage}**`
                        )
                    ]
                });
            }

            logger.info(`User edited AFK status`, {
                userId,
                guildId,
                newMessage: newMessage || 'REMOVED'
            });
        } catch (error) {
            logger.error('EditAFK command error:', error);
            await handleInteractionError(interaction, error, { subtype: 'editafk_failed' });
        }
    }
};
