import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';

const EMOJIS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
const MAX_OPTIONS = 10;
// Migrated from: commands/Tools/poll.js
export default {
    data: new SlashCommandBuilder()
        .setName('poll')
        .setDescription('Create a simple poll with up to 10 options')
        .addStringOption(option =>
            option.setName('question')
                .setDescription('The poll question')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('option1')
                .setDescription('First option')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('option2')
                .setDescription('Second option')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('option3')
                .setDescription('Third option (optional)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('option4')
                .setDescription('Fourth option (optional)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('option5')
                .setDescription('Fifth option (optional)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('option6')
                .setDescription('Sixth option (optional)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('option7')
                .setDescription('Seventh option (optional)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('option8')
                .setDescription('Eighth option (optional)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('option9')
                .setDescription('Ninth option (optional)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('option10')
                .setDescription('Tenth option (optional)')
                .setRequired(false))
        .addBooleanOption(option =>
            option.setName('anonymous')
                .setDescription('Make the poll anonymous (default: false)')
                .setRequired(false)),

    async execute(interaction) {
        try {
            await interaction.deferReply({ flags: ["Ephemeral"] });
            
            const question = interaction.options.getString('question');
            const isAnonymous = interaction.options.getBoolean('anonymous') || false;
            
            // Get all provided options
            const options = [];
            for (let i = 1; i <= MAX_OPTIONS; i++) {
                const option = interaction.options.getString(`option${i}`);
                if (option) options.push(option);
            }
            
            if (options.length < 2) {
                return interaction.editReply({
                    embeds: [errorEmbed('Error', 'You must provide at least 2 options for the poll.')],
                    flags: ["Ephemeral"]
                });
            }
            
            // Build the poll description
            let description = `**${question}**\n\n`;
            options.forEach((option, index) => {
                description += `${EMOJIS[index]} ${option}\n`;
            });
            
            // Add footer about anonymity
            if (isAnonymous) {
                description += '\n*This is an anonymous poll. Votes are not tracked to users.*';
            } else {
                description += '\n*React with the emoji to vote!*';
            }
            
            // Create the poll embed
            const embed = successEmbed(
                `📊 ${isAnonymous ? 'Anonymous ' : ''}Poll`,
                description
            );
            
            // Send the poll
            const message = await interaction.channel.send({ embeds: [embed] });
            
            // Add reactions for each option
            for (let i = 0; i < options.length; i++) {
                await message.react(EMOJIS[i]);
                // Add a small delay to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 500));
            }
            
            await interaction.editReply({
                content: '✅ Poll created successfully!',
                flags: ["Ephemeral"]
            });
            
        } catch (error) {
            console.error('Poll command error:', error);
            await interaction.editReply({
                embeds: [errorEmbed('Error', 'Failed to create the poll. Please try again.')],
                flags: ["Ephemeral"]
            });
        }
    },
};
