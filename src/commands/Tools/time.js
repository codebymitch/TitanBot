import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';
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
                    const timezone = interaction.options.getString('timezone') || 'UTC';
                    
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
                        await interaction.reply({
                            embeds: [errorEmbed('Error', 'Invalid timezone. Please use a valid timezone identifier (e.g., UTC, America/New_York, Europe/London)')],
                            ephemeral: true
                        });
                        return;
                    }
                    
                    const now = new Date();
                    const unixTimestamp = Math.floor(now.getTime() / 1000);
                    
                    const embed = successEmbed(
                        '🕒 Current Time',
                        `**${timezone}:** ${timeString}\n` +
                        `**Unix Timestamp:** \`${unixTimestamp}\`\n` +
                        `**ISO String:** \`${now.toISOString()}\``
                    );
                    
                    await interaction.reply({ embeds: [embed], ephemeral: true });
        } catch (error) {
            console.error('Time command error:', error);
            const replyMethod = interaction.replied || interaction.deferred ? 'editReply' : 'reply';
            await interaction[replyMethod]({
                embeds: [errorEmbed('Error', 'Failed to get the current time.')],
                ephemeral: true
            });
        }
    },
};
