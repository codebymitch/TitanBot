import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

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
        await InteractionHelper.safeExecute(
            interaction,
            async () => {
                try {
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
                        await InteractionHelper.safeEditReply(interaction, {
                            embeds: [errorEmbed('Error', 'Invalid timezone. Please use a valid timezone identifier (e.g., UTC, America/New_York, Europe/London)')],
                            flags: ["Ephemeral"]
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
                    
                    await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
                } catch (error) {
                    console.error('Time command error:', error);
                    await InteractionHelper.safeEditReply(interaction, {
                        embeds: [errorEmbed('Error', 'Failed to get the current time.')],
                        flags: ["Ephemeral"]
                    });
                }
            },
            errorEmbed('Failed to get time. Please try again later.')
        );
    },
};
