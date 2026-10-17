import type { Command } from '../../types/index.js';
import { SlashCommandBuilder, PermissionFlagsBits, ChannelType } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

import dashboard from './modules/logging_dashboard.js';
import channel from './modules/logging_channel.js';

import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
export default {
    data: new SlashCommandBuilder()
        .setName('logging')
        .setDescription('Server-Logging verwalten – Kanäle, Filter und Event-Kategorien.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .setDMPermission(false)
        .addSubcommand((subcommand) =>
            subcommand
                .setName('dashboard')
                .setDescription('Logging-Dashboard öffnen – Kanäle, Filter und Kategorien einstellen.'),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName('channel')
                .setDescription('Log-Kanal schnell setzen, ohne das Dashboard zu öffnen.')
                .addStringOption((option) =>
                    option
                        .setName('destination')
                        .setDescription('Welches Log-Ziel du konfigurieren willst.')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Audit (Moderation, Nachrichten, Mitglieder…)', value: 'audit' },
                            { name: 'Bewerbungen', value: 'applications' },
                            { name: 'Meldungen', value: 'reports' },
                        ),
                )
                .addChannelOption((option) =>
                    option
                        .setName('channel')
                        .setDescription('Der Textkanal für Logs.')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(false),
                )
                .addBooleanOption((option) =>
                    option
                        .setName('disable')
                        .setDescription('Auf True setzen, um diesen Log-Kanal zu entfernen.')
                        .setRequired(false),
                ),
        ),

    async execute(interaction, config, client) {
        try {
            const subcommand = interaction.options.getSubcommand();

            if (subcommand === 'dashboard') {
                return await dashboard.execute(interaction, config, client);
            }

            if (subcommand === 'channel') {
                return await channel.execute(interaction, config, client);
            }

            await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: 'Dieser Subcommand ist unbekannt.' });
        } catch (error) {
            logger.error('logging command error:', error);
            await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Ein unerwarteter Fehler ist aufgetreten.' }).catch(() => {});
        }
    },
} satisfies Command;
