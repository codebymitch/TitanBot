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

            const embed = warningEmbed(warningMessage, '🗑️ Wipe All Data');

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




