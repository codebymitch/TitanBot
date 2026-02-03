import { SlashCommandBuilder } from 'discord.js';
import economyRob from './modules/economy_rob.js';

export default {
    data: new SlashCommandBuilder()
        .setName('rob')
        .setDescription('Attempt to rob another user (very risky)')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('User to rob')
                .setRequired(true)
        ),

    async execute(interaction, config, client) {
        return economyRob.execute(interaction, config, client);
    },
};

