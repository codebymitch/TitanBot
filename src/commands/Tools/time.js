import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { getColor } from '../../config/bot.js';
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
                        logger.warn(`Invalid timezone requested: ${timezone}`);
                        const embed = errorEmbed('Invalid Timezone', 'Invalid timezone. Please use a valid timezone identifier (e.g., UTC, America/New_York, Europe/London)');
                        embed.setColor(getColor('error'));
                        await interaction.reply({
                            embeds: [embed],
                            flags: MessageFlags.Ephemeral
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
                    
                    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        } catch (error) {
            await handleInteractionError(interaction, error, {
                type: 'command',
                commandName: 'time'
            });
        }
    },
};




