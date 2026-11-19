import { SlashCommandBuilder, ChannelType } from 'discord.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';

import streakView from './modules/streak_view.js';
import streakLeaderboard from './modules/streak_leaderboard.js';
import streakChannel from './modules/streak_channel.js';
import streakToggle from './modules/streak_toggle.js';

export default {
    data: new SlashCommandBuilder()
        .setName('streak')
        .setDescription('View your active daily streak on this server')
        .addSubcommand(subcommand =>
            subcommand
                .setName('view')
                .setDescription('View your daily streak (or another member\'s)')
                .addUserOption(option =>
                    option
                        .setName('user')
                        .setDescription('The member whose streak to view (optional, defaults to you)')
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('leaderboard')
                .setDescription('Show the server streak leaderboard')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('channel')
                .setDescription('Set the streak notification channel (Manage Server)')
                .addChannelOption(option =>
                    option
                        .setName('channel')
                        .setDescription('Text channel for streak notifications. Leave empty to remove.')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('toggle')
                .setDescription('Enable/disable the streak system on this server (Manage Server)')
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
