import type { Command } from '../../types/index.js';
import { SlashCommandBuilder } from 'discord.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';

import searchDefine from './modules/search_define.js';
import searchGoogle from './modules/search_google.js';
import searchUrban from './modules/search_urban.js';

export default {
    data: new SlashCommandBuilder()
        .setName('search')
        .setDescription('Im Web und in Wörterbüchern suchen')
        .addSubcommand(subcommand =>
            subcommand
                .setName('define')
                .setDescription('Die englische Definition eines Worts nachschlagen')
                .addStringOption(option =>
                    option.setName('word')
                        .setDescription('Das (englische) Wort, das du nachschlagen willst')
                        .setRequired(true))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('google')
                .setDescription('Bei Google suchen')
                .addStringOption(option =>
                    option.setName('query')
                        .setDescription('Wonach möchtest du suchen?')
                        .setRequired(true))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('urban')
                .setDescription('Definitionen im Urban Dictionary suchen')
                .addStringOption(option =>
                    option.setName('term')
                        .setDescription('Der Begriff, den du im Urban Dictionary suchen willst')
                        .setRequired(true))
        ),

    async execute(interaction, config, client) {
        const subcommand = interaction.options.getSubcommand();

        switch (subcommand) {
            case 'define':
                return await searchDefine.execute(interaction);
            case 'google':
                return await searchGoogle.execute(interaction);
            case 'urban':
                return await searchUrban.execute(interaction);
            default:
                return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Unbekannter Subcommand' });
        }
    }
} satisfies Command;
