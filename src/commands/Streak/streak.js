import { SlashCommandBuilder } from 'discord.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';

import streakView from './modules/streak_view.js';
import streakLeaderboard from './modules/streak_leaderboard.js';

export default {
    data: new SlashCommandBuilder()
        .setName('streak')
        .setDescription('Lihat streak harian aktifmu di server ini')
        .addSubcommand(subcommand =>
            subcommand
                .setName('view')
                .setDescription('Lihat streak harianmu (atau member lain)')
                .addUserOption(option =>
                    option
                        .setName('user')
                        .setDescription('Member yang mau dilihat streak-nya (opsional, default: dirimu sendiri)')
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('leaderboard')
                .setDescription('Tampilkan leaderboard streak server')
        ),

    async execute(interaction, config, client) {
        const subcommand = interaction.options.getSubcommand();

        switch (subcommand) {
            case 'view':
                return await streakView.execute(interaction, config, client);
            case 'leaderboard':
                return await streakLeaderboard.execute(interaction, config, client);
            default:
                return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Unknown subcommand' });
        }
    }
};
