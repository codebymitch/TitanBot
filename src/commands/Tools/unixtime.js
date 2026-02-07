import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';
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
                
                await interaction.editReply({ 
                    embeds: [embed],
                    flags: ["Ephemeral"]
                },
                errorEmbed('Failed to get Unix timestamp. Please try again later.')
            );
        } catch (error) {
            console.error('Unixtime command error:', error);
            return interaction.reply({
                embeds: [errorEmbed('System Error', 'Could not get Unix timestamp at this time.')],
                ephemeral: true,
            });
        }
    },
};
