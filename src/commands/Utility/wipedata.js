import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, warningEmbed } from '../../utils/embeds.js';
import { getConfirmationButtons } from '../../utils/components.js';

export default {
    data: new SlashCommandBuilder()
        .setName('wipedata')
        .setDescription('Delete all your personal data from the bot (irreversible)'),

    async execute(interaction, guildConfig, client) {
        try {
            const warningMessage = 
                `âš ï¸ **THIS ACTION IS IRREVERSIBLE!** âš ï¸\n\n` +
                `This will permanently delete **ALL** your data from this server including:\n` +
                `â€¢ ðŸ’° Economy balance (wallet & bank)\n` +
                `â€¢ ðŸ“Š Levels and XP\n` +
                `â€¢ ðŸŽ’ Inventory items\n` +
                `â€¢ ðŸ›ï¸ Shop purchases\n` +
                `â€¢ ðŸŽ‚ Birthday information\n` +
                `â€¢ ðŸ”¢ Counter data\n` +
                `â€¢ ðŸ“‹ All other personal data\n\n` +
                `**This cannot be undone. Are you absolutely sure?**`;

            const embed = warningEmbed(warningMessage, 'ðŸ—‘ï¸ Wipe All Data');

            const confirmButtons = getConfirmationButtons('wipedata');

            await interaction.reply({
                embeds: [embed],
                components: [confirmButtons],
                flags: MessageFlags.Ephemeral
            });
        } catch (error) {
            console.error('Wipedata command error:', error);
            await interaction.reply({
                embeds: [errorEmbed('Error', 'Could not process wipedata command.')],
                flags: MessageFlags.Ephemeral
            });
        }
    }
};

