import { SlashCommandBuilder } from 'discord.js';
import economyBuy from './modules/economy_buy.js';

export default {
    data: new SlashCommandBuilder()
        .setName('buy')
        .setDescription('Buy an item from the shop')
        .addStringOption(option =>
            option
                .setName('item_id')
                .setDescription('ID of the item to buy')
                .setRequired(true)
        )
        .addIntegerOption(option =>
            option
                .setName('quantity')
                .setDescription('Quantity to buy (default: 1)')
                .setRequired(false)
                .setMinValue(1)
                .setMaxValue(10)
        ),

    async execute(interaction, config, client) {
        return economyBuy.execute(interaction, config, client);
    },
};

