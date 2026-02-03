import { SlashCommandBuilder } from 'discord.js';
import economyDaily from './modules/economy_daily.js';

export default {
    data: new SlashCommandBuilder()
        .setName('daily')
        .setDescription('Claim your daily cash reward'),

    async execute(interaction, config, client) {
        return economyDaily.execute(interaction, config, client);
    },
};

