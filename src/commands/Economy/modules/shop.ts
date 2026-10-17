import type { Command } from '../../../types/index.js';
import { SlashCommandBuilder } from 'discord.js';
import shopBrowse from './shop_browse.js';

export default {
    slashOnly: true,
    data: new SlashCommandBuilder()
        .setName('shop')
        .setDescription('Durchstöbere den Shop.'),

    async execute(interaction, config, client) {
        return shopBrowse.execute(interaction, config, client);
    },
} satisfies Command;
