import { SlashCommandBuilder } from 'discord.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';

import streakView from './modules/streak_view.js';
import streakRequest from './modules/streak_request.js';
import streakSend from './modules/streak_send.js';
import streakList from './modules/streak_list.js';
import streakLeaderboard from './modules/streak_leaderboard.js';

export default {
    data: new SlashCommandBuilder()
        .setName('streak')
        .setDescription('TikTok-style interaction streaks with other members')
        .addSubcommand(subcommand =>
            subcommand
                .setName('view')
                .setDescription('View your streak with another member')
                .addUserOption(option =>
                    option
                        .setName('user')
                        .setDescription('The member to view the streak with')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('request')
                .setDescription('Send a streak request to a member')
                .addUserOption(option =>
                    option
                        .setName('user')
                        .setDescription('The member to request a streak with')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('send')
                .setDescription('Send a streak to a member (both of you must send each day)')
                .addUserOption(option =>
                    option
                        .setName('user')
                        .setDescription('The member to send your streak to')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('List your active streaks in this server')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('leaderboard')
                .setDescription('Show the server streak leaderboard')
        ),

    async execute(interaction, config, client) {
        const subcommand = interaction.options.getSubcommand();

        switch (subcommand) {
            case 'view':
                return await streakView.execute(interaction, config, client);
            case 'request':
                return await streakRequest.execute(interaction, config, client);
            case 'send':
                return await streakSend.execute(interaction, config, client);
            case 'list':
                return await streakList.execute(interaction, config, client);
            case 'leaderboard':
                return await streakLeaderboard.execute(interaction, config, client);
            default:
                return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Unknown subcommand' });
        }
    }
};
