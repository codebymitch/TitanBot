import { SlashCommandBuilder } from 'discord.js';
import economyMine from './modules/economy_mine.js';

export default {
    data: new SlashCommandBuilder()
        .setName('mine')
        .setDescription('Go mining to earn money'),

    async execute(interaction, config, client) {
        return economyMine.execute(interaction, config, client);
    },
};

