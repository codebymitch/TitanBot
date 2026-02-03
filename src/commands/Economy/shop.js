import { SlashCommandBuilder } from 'discord.js';
import economyShop from './modules/economy_shop.js';

export default {
    data: new SlashCommandBuilder()
        .setName('shop')
        .setDescription('View the economy shop'),

    async execute(interaction, config, client) {
        return economyShop.execute(interaction, config, client);
    },
};

