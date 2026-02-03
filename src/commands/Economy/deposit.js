import { SlashCommandBuilder } from 'discord.js';
import economyDeposit from './modules/economy_deposit.js';

export default {
    data: new SlashCommandBuilder()
        .setName('deposit')
        .setDescription('Deposit money from your wallet into your bank')
        .addStringOption(option =>
            option
                .setName('amount')
                .setDescription('Amount to deposit (number or "all")')
                .setRequired(true)
        ),

    async execute(interaction, config, client) {
        return economyDeposit.execute(interaction, config, client);
    },
};

