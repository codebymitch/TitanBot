import { SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';

// Migrated from: commands/Search/urban.js
export default {
    data: new SlashCommandBuilder()
        .setName('urban')
        .setDescription('Search Urban Dictionary for definitions')
        .addStringOption(option => 
            option.setName('term')
                .setDescription('The term to look up on Urban Dictionary')
                .setRequired(true)),
    
    async execute(interaction) {
        try {
            const term = interaction.options.getString('term');
            
            // Check if the term is too short
            if (term.length < 2) {
                return await interaction.reply({
                    embeds: [errorEmbed('Error', 'Please enter a term with at least 2 characters.')],
                    ephemeral: true
                });
            }
            
            // Check if Urban Dictionary is enabled in the guild config
            const guildConfig = await getGuildConfig(interaction.client, interaction.guild.id);
            if (guildConfig?.disabledCommands?.includes('urban')) {
                return await interaction.reply({
                    embeds: [errorEmbed('Command Disabled', 'The Urban Dictionary command is disabled in this server.')],
                    ephemeral: true
                });
            }
            
            const response = await axios.get(
                `https://api.urbandictionary.com/v0/define?term=${encodeURIComponent(term)}`,
                { timeout: 5000 }
            );
            
            if (!response.data?.list?.length) {
                return await interaction.reply({
                    embeds: [errorEmbed('Not Found', `No definitions found for "${term}" on Urban Dictionary.`)]
                });
            }
            
            const definition = response.data.list[0];
            const cleanDefinition = definition.definition.replace(/\[|\]/g, '');
            const cleanExample = definition.example.replace(/\[|\]/g, '');
            
            // Format the definition to handle markdown and newlines
            const formattedDefinition = cleanDefinition
                .replace(/\n\s*\n/g, '\n\n') // Normalize multiple newlines
                .slice(0, 2000);
                
            // Format the example to handle markdown and newlines
            const formattedExample = cleanExample
                ? `*"${cleanExample.replace(/\n/g, ' ').slice(0, 500)}..."*`
                : '*No example provided*';
            
            // Create the embed with successEmbed for consistent styling
            const embed = successEmbed(
                definition.word,
                formattedDefinition
            )
            .setURL(definition.permalink)
            .addFields(
                { 
                    name: 'Example', 
                    value: formattedExample,
                    inline: false 
                },
                { 
                    name: 'Stats', 
                    value: `👍 ${definition.thumbs_up.toLocaleString()} • 👎 ${definition.thumbs_down.toLocaleString()}`,
                    inline: true 
                },
                { 
                    name: 'Author', 
                    value: definition.author || 'Anonymous',
                    inline: true 
                }
            )
            .setFooter({ 
                text: 'Urban Dictionary',
                iconURL: 'https://i.imgur.com/8aQrX3a.png' 
            });
                
            await interaction.reply({ embeds: [embed] });
            
        } catch (error) {
            console.error('Urban Dictionary error:', error);
            
            let errorMessage = 'Failed to fetch from Urban Dictionary. ';
            if (error.code === 'ECONNABORTED') {
                errorMessage = 'The request to Urban Dictionary timed out. Please try again later.';
            } else if (error.response?.status === 429) {
                errorMessage = 'Too many requests to Urban Dictionary. Please try again in a few minutes.';
            }
            
            await interaction.reply({
                embeds: [errorEmbed('Error', errorMessage)],
                ephemeral: true
            });
        }
    },
};

// Helper function to get guild config
async function getGuildConfig(client, guildId) {
    try {
        const config = await client.db.get(`guild_${guildId}_config`);
        return config || {};
    } catch (error) {
        console.error('Error fetching guild config:', error);
        return {};
    }
}
