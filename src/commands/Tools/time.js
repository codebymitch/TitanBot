import { SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';

// Migrated from: commands/Tools/time.js
export default {
    data: new SlashCommandBuilder()
        .setName('time')
        .setDescription('Get the current time in different timezones')
        .addStringOption(option =>
            option.setName('timezone')
                .setDescription('The timezone to display (e.g., UTC, America/New_York)')
                .setRequired(false)),

    async execute(interaction) {
        try {
            await interaction.deferReply();
            
            const timezone = interaction.options.getString('timezone') || 'UTC';
            
            // Validate timezone
            let timeString;
            try {
                timeString = new Date().toLocaleString('en-US', {
                    timeZone: timezone,
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    timeZoneName: 'short'
                });
            } catch (error) {
                return interaction.editReply({
                    embeds: [errorEmbed('Error', 'Invalid timezone. Please use a valid timezone identifier (e.g., UTC, America/New_York, Europe/London)')],
                    ephemeral: true
                });
            }
            
            const now = new Date();
            const unixTimestamp = Math.floor(now.getTime() / 1000);
            
            const embed = successEmbed(
                '🕒 Current Time',
                `**${timezone}:** ${timeString}\n` +
                `**Unix Timestamp:** \`${unixTimestamp}\`\n` +
                `**ISO String:** \`${now.toISOString()}\``
            );
            
            await interaction.editReply({ embeds: [embed] });
            
        } catch (error) {
            console.error('Time command error:', error);
            await interaction.editReply({
                embeds: [errorEmbed('Error', 'Failed to get the current time.')],
                ephemeral: true
            });
        }
    },
};
