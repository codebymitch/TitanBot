import { SlashCommandBuilder, ChannelType } from 'discord.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';

import streakView from './modules/streak_view.js';
import streakLeaderboard from './modules/streak_leaderboard.js';
import streakChannel from './modules/streak_channel.js';
import streakToggle from './modules/streak_toggle.js';

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
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('channel')
                .setDescription('Set channel notifikasi streak (Manage Server)')
                .addChannelOption(option =>
                    option
                        .setName('channel')
                        .setDescription('Channel text untuk notifikasi streak. Kosongkan untuk menghapus.')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('toggle')
                .setDescription('Nyalain/matiin sistem streak di server ini (Manage Server)')
        ),

    async execute(interaction, config, client) {
        const subcommand = interaction.options.getSubcommand();

        switch (subcommand) {
            case 'view':
                return await streakView.execute(interaction, config, client);
            case 'leaderboard':
                return await streakLeaderboard.execute(interaction, config, client);
            case 'channel':
                return await streakChannel.execute(interaction, config, client);
            case 'toggle':
                return await streakToggle.execute(interaction, config, client);
            default:
                return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Unknown subcommand' });
        }
    }
};
