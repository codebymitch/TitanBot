import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';

// Migrated from: commands/Tools/unixtime.js
export default {
    data: new SlashCommandBuilder()
        .setName('unixtime')
        .setDescription('Get the current Unix timestamp'),

    async execute(interaction) {
        try {
            await interaction.deferReply({ ephemeral: true });
            
            const now = new Date();
            const unixTimestamp = Math.floor(now.getTime() / 1000);
            
            const embed = successEmbed(
                '⏱️ Current Unix Timestamp',
                `**Seconds since Unix Epoch:** \`${unixTimestamp}\`\n` +
                `**Milliseconds since Unix Epoch:** \`${now.getTime()}\`\n\n` +
                `**Human-readable (UTC):** ${now.toUTCString()}\n` +
                `**ISO String:** ${now.toISOString()}`
            );
            
            await interaction.editReply({ embeds: [embed] });
            
        } catch (error) {
            console.error('Unixtime command error:', error);
            await interaction.editReply({
                content: '❌ Failed to get the current Unix timestamp.',
                ephemeral: true
            });
        }
    },
};
