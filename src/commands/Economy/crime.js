import { SlashCommandBuilder } from 'discord.js';
import economyCrime from './modules/economy_crime.js';

export default {
    data: new SlashCommandBuilder()
        .setName('crime')
        .setDescription('Commit a crime to earn money (risky)')
        .addStringOption(option =>
            option
                .setName('type')
                .setDescription('Type of crime to commit')
                .setRequired(true)
                .addChoices(
                    { name: 'Pickpocketing', value: 'pickpocketing' },
                    { name: 'Burglary', value: 'burglary' },
                    { name: 'Bank Heist', value: 'bank-heist' },
                    { name: 'Art Theft', value: 'art-theft' },
                    { name: 'Cybercrime', value: 'cybercrime' },
                )
        ),

    async execute(interaction, config, client) {
        return economyCrime.execute(interaction, config, client);
    },
};

