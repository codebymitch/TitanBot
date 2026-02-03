import { SlashCommandBuilder } from 'discord.js';
import economySlut from './modules/economy_slut.js';

export default {
    data: new SlashCommandBuilder()
        .setName('slut')
        .setDescription('Do risky work to earn money')
        .addStringOption(option =>
            option
                .setName('activity')
                .setDescription('Type of activity to perform')
                .setRequired(false)
                .addChoices(
                    { name: 'Street Walking', value: 'street_walking' },
                    { name: 'Escort Service', value: 'escort_service' },
                    { name: 'Private Party', value: 'private_party' },
                    { name: 'VIP Client', value: 'vip_client' },
                    { name: 'Exclusive Service', value: 'exclusive_service' },
                )
        ),

    async execute(interaction, config, client) {
        return economySlut.execute(interaction, config, client);
    },
};

