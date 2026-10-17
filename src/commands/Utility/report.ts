import { SlashCommandBuilder, ChannelType } from 'discord.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

import report from './modules/report.js';
import reportSetchannel from './modules/report_setchannel.js';
import type { Command } from '../../types/index.js';

export default {
    data: new SlashCommandBuilder()
        .setName('report')
        .setDescription('Melde einen Nutzer an das Server-Team oder lege fest, wohin Meldungen gehen.')
        .setDMPermission(false)
        .addSubcommand(subcommand =>
            subcommand
                .setName('file')
                .setDescription('Melde einen Nutzer an das Moderationsteam.')
                .addUserOption(option =>
                    option
                        .setName('user')
                        .setDescription('Der Nutzer, den du melden möchtest.')
                        .setRequired(true),
                )
                .addStringOption(option =>
                    option
                        .setName('reason')
                        .setDescription('Der Grund für die Meldung (bitte ausführlich).')
                        .setRequired(true)
                        .setMaxLength(500),
                ),
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('setchannel')
                .setDescription('Lege den Kanal für Nutzermeldungen fest. („Server verwalten“ nötig)')
                .addChannelOption(option =>
                    option
                        .setName('channel')
                        .setDescription('Der Textkanal, der die Meldungen empfängt.')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true),
                ),
        ),
    category: 'Utility',

    async execute(interaction, config, client) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'file') {
            return await report.execute(interaction, config, client);
        }

        if (subcommand === 'setchannel') {
            return await reportSetchannel.execute(interaction, config, client);
        }

        return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Unbekannter Subcommand.' });
    },
} satisfies Command;