import { SlashCommandBuilder } from 'discord.js';
import economyPay from './modules/economy_pay.js';

export default {
    data: new SlashCommandBuilder()
        .setName('pay')
        .setDescription('Pay another user some of your cash')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('User to pay')
                .setRequired(true)
        )
        .addIntegerOption(option =>
            option
                .setName('amount')
                .setDescription('Amount to pay')
                .setRequired(true)
                .setMinValue(1)
        ),

    async execute(interaction, config, client) {
        return economyPay.execute(interaction, config, client);
    },
};

