import { SlashCommandBuilder, ChannelType } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

import report from './modules/report.js';
import reportSetchannel from './modules/report_setchannel.js';

export default {
    data: new SlashCommandBuilder()
        .setName('report')
        .setDescription('Report a user to server staff, or configure where reports are sent.')
        .setDMPermission(false)
        .addSubcommand(subcommand =>
            subcommand
                .setName('file')
                .setDescription('Report a user to the server moderation team.')
                .addUserOption(option =>
                    option
                        .setName('user')
                        .setDescription('The user you want to report.')
                        .setRequired(true),
                )
                .addStringOption(option =>
                    option
                        .setName('reason')
                        .setDescription('The reason for the report (be detailed).')
                        .setRequired(true)
                        .setMaxLength(500),
                ),
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('setchannel')
                .setDescription('Set the channel where user reports are sent. (Manage Server required)')
                .addChannelOption(option =>
                    option
                        .setName('channel')
                        .setDescription('The text channel to receive reports.')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true),
                ),
        ),
    category: 'Utility',

    async execute(interaction, config, client) {
        try {
            const subcommand = interaction.options.getSubcommand();

            if (subcommand === 'file') {
                return await report.execute(interaction, config, client);
            }

            if (subcommand === 'setchannel') {
                return await reportSetchannel.execute(interaction, config, client);
            }

            return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Unknown subcommand.' });
        } catch (error) {
            logger.error('report command error:', error);
            await handleInteractionError(interaction, error, { commandName: 'report', source: 'report_command' });
        }
    },
};