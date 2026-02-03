import { SlashCommandBuilder } from 'discord.js';
import economyWork from './modules/economy_work.js';

export default {
    data: new SlashCommandBuilder()
        .setName('work')
        .setDescription('Work to earn some money'),

    async execute(interaction, config, client) {
        return economyWork.execute(interaction, config, client);
    },
};

