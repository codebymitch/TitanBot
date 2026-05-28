import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, successEmbed, errorEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getFromDb, setInDb } from '../../utils/database.js';

export default {
    data: new SlashCommandBuilder()
        .setName("afk")
        .setDescription("Set your AFK status with a message")
        .addStringOption((option) =>
            option
                .setName("message")
                .setDescription("Your AFK message (optional)")
                .setRequired(false)
        ),
    category: "utility",

    async execute(interaction) {
        try {
            const deferSuccess = await InteractionHelper.safeDefer(interaction);
            if (!deferSuccess) {
                logger.warn(`AFK interaction defer failed`, {
                    userId: interaction.user.id,
                    guildId: interaction.guildId,
                    commandName: 'afk'
                });
                return;
            }

            const message = (() => {\n                // Support both slash command and prefix command\n                let msg = interaction.options?.getString(\"message\");\n                \n                // For prefix commands, get message from reason\n                if (interaction._isPrefix) {\n                    const args = interaction.options?.getString?.('reason');\n                    msg = args || \"I'm AFK right now!\";\n                }\n                \n                return msg || \"I'm AFK right now!\";\n            })();
            const userId = interaction.user.id;
            const guildId = interaction.guildId;

            // Store AFK status in database
            const afkKey = `afk:${guildId}:${userId}`;
            const afkData = {
                userId,
                guildId,
                message,
                timestamp: Date.now(),
                username: interaction.user.username
            };

            await setInDb(afkKey, afkData);

            // Also update nickname if bot has permissions
            try {
                if (interaction.member && interaction.guild.members.me?.permissions.has('ChangeNickname')) {
                    const currentNick = interaction.member.nickname || interaction.user.username;
                    if (!currentNick.includes('[AFK]')) {
                        await interaction.member.setNickname(`[AFK] ${currentNick.substring(0, 27)}`);
                    }
                }
            } catch (err) {
                logger.warn('Could not update nickname for AFK:', err.message);
            }

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    successEmbed(
                        '💤 AFK Status Set',
                        `Your message: **${message}**\n\nI'll let people know you're away!`
                    )
                ]
            });

            logger.info(`User set AFK status`, {
                userId,
                guildId,
                message
            });
        } catch (error) {
            logger.error('AFK command error:', error);
            await handleInteractionError(interaction, error, { subtype: 'afk_failed' });
        }
    }
};
