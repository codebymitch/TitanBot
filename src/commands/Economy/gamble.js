import { SlashCommandBuilder } from 'discord.js';
import economyGamble from './modules/economy_gamble.js';

export default {
    data: new SlashCommandBuilder()
        .setName('gamble')
        .setDescription('Gamble your money for a chance to win more')
        .addIntegerOption(option =>
            option
                .setName('amount')
                .setDescription('Amount of cash to gamble')
                .setRequired(true)
                .setMinValue(1)
        ),

    async execute(interaction, config, client) {
        return economyGamble.execute(interaction, config, client);
    },
};

