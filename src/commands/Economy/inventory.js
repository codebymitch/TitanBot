import { SlashCommandBuilder } from 'discord.js';
import economyInventory from './modules/economy_inventory.js';

export default {
    data: new SlashCommandBuilder()
        .setName('inventory')
        .setDescription('View your economy inventory'),

    async execute(interaction, config, client) {
        return economyInventory.execute(interaction, config, client);
    },
};

