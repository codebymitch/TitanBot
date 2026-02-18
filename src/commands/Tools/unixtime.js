import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { getColor } from '../../config/bot.js';
export default {
    data: new SlashCommandBuilder()
        .setName('unixtime')
        .setDescription('Get the current Unix timestamp'),

    async execute(interaction) {
        try {
            const now = new Date();
            const unixTimestamp = Math.floor(now.getTime() / 1000);
            
            const embed = successEmbed(
                '⏱️ Current Unix Timestamp',
                `**Seconds since Unix Epoch:** \`${unixTimestamp}\`\n` +
                `**Milliseconds since Unix Epoch:** \`${now.getTime()}\`\n\n` +
                `**Human-readable (UTC):** ${now.toUTCString()}\n` +
                `**ISO String:** ${now.toISOString()}`
            );
            embed.setColor(getColor('success'));
            
            await interaction.reply({ 
                embeds: [embed],
                flags: ['Ephemeral']
            });
        } catch (error) {
            await handleInteractionError(interaction, error, {
                type: 'command',
                commandName: 'unixtime'
            });
        }
    },
};



