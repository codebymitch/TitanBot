import { SlashCommandBuilder } from 'discord.js';
import economyBeg from './modules/economy_beg.js';

export default {
    data: new SlashCommandBuilder()
        .setName('beg')
        .setDescription('Beg for a small amount of money'),

    async execute(interaction, config, client) {
        return economyBeg.execute(interaction, config, client);
    },
};

