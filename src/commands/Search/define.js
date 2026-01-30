import { SlashCommandBuilder } from 'discord.js';
import axios from 'axios';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';

// Migrated from: commands/Search/define.js
export default {
    data: new SlashCommandBuilder()
        .setName('define')
        .setDescription('Look up a word definition')
        .addStringOption(option => 
            option.setName('word')
                .setDescription('The word to look up')
                .setRequired(true)),
    async execute(interaction) {
        try {
            const word = interaction.options.getString('word');
            
            // Check if the word is too short
            if (word.length < 2) {
                return await interaction.reply({
                    embeds: [errorEmbed('Error', 'Please enter a word with at least 2 characters.')],
                    ephemeral: true
                });
            }
            
            const response = await axios.get(
                `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`,
                { timeout: 5000 }
            );
            
            if (!response.data || response.data.length === 0) {
                return await interaction.reply({
                    embeds: [errorEmbed('Not Found', `No definitions found for "${word}".`)]
                });
            }
            
            const data = response.data[0];
            const embed = successEmbed(
                data.word,
                data.phonetic ? `*${data.phonetic}*` : ''
            );
            
            // Add each meaning with examples
            data.meanings.slice(0, 5).forEach(meaning => {
                const definitions = meaning.definitions
                    .slice(0, 3)
                    .map((def, idx) => {
                        let text = `${idx + 1}. ${def.definition}`;
                        if (def.example) {
                            text += `\n   *Example: ${def.example}*`;
                        }
                        return text;
                    })
                    .join('\n\n');
                
                if (definitions) {
                    embed.addFields({
                        name: `**${meaning.partOfSpeech || 'Definition'}**`,
                        value: definitions,
                        inline: false
                    });
                }
            });
            
            // Add source attribution
            embed.setFooter({ text: 'Powered by Free Dictionary API' });
            
            await interaction.reply({ embeds: [embed] });
            
        } catch (error) {
            console.error('Dictionary lookup error:', error);
            
            let errorMessage = 'Failed to look up the word. ';
            if (error.response) {
                if (error.response.status === 404) {
                    errorMessage = `No definitions found for "${interaction.options.getString('word')}".`;
                } else {
                    errorMessage += `API Error: ${error.response.status} ${error.response.statusText}`;
                }
            } else if (error.code === 'ECONNABORTED') {
                errorMessage += 'The request timed out. Please try again later.';
            }
            
            await interaction.reply({
                embeds: [errorEmbed('Error', errorMessage)],
                ephemeral: true
            });
        }
    },
};
