import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { createEmbed, errorEmbed, warningEmbed } from '../../utils/embeds.js';
import { getConfirmationButtons } from '../../utils/components.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError } from '../../utils/errorHandler.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
export default {
    slashOnly: true,
    data: new SlashCommandBuilder()
        .setName('wipedata')
        .setDescription('Delete all your personal data from the bot (irreversible)'),

    async execute(interaction, guildConfig, client) {
        try {
            const warningMessage = 
                `⚠️ **THIS ACTION IS IRREVERSIBLE!** ⚠️\n\n` +
                `This will permanently delete **ALL** your data from this server including:\n` +
                `• 💰 Economy balance (wallet & bank)\n` +
                `• 📊 Levels and XP\n` +
                `• 🎒 Inventory items\n` +
                `• 🛍️ Shop purchases\n` +
                `• 🎂 Birthday information\n` +
                `• 🔢 Counter data\n` +
                `• 📋 All other personal data\n\n` +
                `**This cannot be undone. Are you absolutely sure?**`;

            const embed = warningEmbed('Wipe All Data', warningMessage);

            const confirmButtons = getConfirmationButtons('wipedata');

            await InteractionHelper.safeReply(interaction, {
                embeds: [embed],
                components: [confirmButtons],
                flags: MessageFlags.Ephemeral
            });

            logger.info(`Wipedata command executed - confirmation prompt shown`, {
                userId: interaction.user.id,
                guildId: interaction.guildId
            });
        } catch (error) {
            logger.error(`Wipedata command execution failed`, {
                error: error.message,
                stack: error.stack,
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'wipedata'
            });
            await handleInteractionError(interaction, error, {
                commandName: 'wipedata',
                source: 'wipedata_command'
            });
        }
    }
};