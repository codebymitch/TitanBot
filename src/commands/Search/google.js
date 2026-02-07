import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';

export default {
    data: new SlashCommandBuilder()
        .setName('google')
        .setDescription('Search Google')
        .addStringOption(option => 
            option.setName('query')
                .setDescription('What would you like to search for?')
                .setRequired(true)),
    async execute(interaction) {
try {
            const query = interaction.options.getString('query');
            const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
            
            const embed = successEmbed(
                'Google Search',
                `[Search for "${query}"](${searchUrl})`
            )
            .setFooter({ text: 'Google Search Results' });

            await interaction.reply({ embeds: [embed] });
        } catch (error) {
            console.error('Error in google command:', error);
            await interaction.editReply({ 
                embeds: [errorEmbed('Error', 'Failed to process your search. Please try again later.')],
                flags: ["Ephemeral"] 
            });
        }
    },
};
