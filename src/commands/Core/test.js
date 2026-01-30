import { SlashCommandBuilder } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('test')
        .setDescription('Test command to verify interactions are working'),

    async execute(interaction) {
        console.log('Test command executed!');
        await interaction.reply('✅ Test command is working!');
    }
};
