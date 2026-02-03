import { SlashCommandBuilder } from 'discord.js';
import economyWithdraw from './modules/economy_withdraw.js';

export default {
    data: new SlashCommandBuilder()
        .setName('withdraw')
        .setDescription('Withdraw money from your bank to your wallet')
        .addIntegerOption(option =>
            option
                .setName('amount')
                .setDescription('Amount to withdraw')
                .setRequired(true)
                .setMinValue(1)
        ),

    async execute(interaction, config, client) {
        return economyWithdraw.execute(interaction, config, client);
    },
};

