import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { logger } from '../../../utils/logger.js';
import { handleInteractionError, NexoBotError, ErrorTypes, replyUserError } from '../../../utils/errorHandler.js';
import greetDashboard from './greet_dashboard.js';
import type { Command } from '../../../types/index.js';

export default {
    slashOnly: true,
    data: new SlashCommandBuilder()
        .setName('greet')
        .setDescription('Willkommens- und Abschiedseinstellungen verwalten')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(subcommand =>
            subcommand
                .setName('dashboard')
                .setDescription('Das Dashboard für Willkommen und Abschied öffnen'),
        ),

    async execute(interaction, config, client) {
        try {
            if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
                return await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: 'Du brauchst die Berechtigung **Server verwalten**, um `/welcome greet` zu nutzen.' });
            }

            const subcommand = interaction.options.getSubcommand();

            switch (subcommand) {
                case 'dashboard':
                    return await greetDashboard.execute(interaction, config, client);
                default:
                    logger.warn(`Unknown /welcome greet subcommand: ${subcommand}`);
            }
        } catch (error) {
            if (error instanceof NexoBotError) {
                return await replyUserError(interaction, { type: ErrorTypes.CONFIGURATION, message: error.userMessage || 'Etwas ist schiefgelaufen.' });
            }
            await handleInteractionError(interaction, error, { command: 'greet' });
        }
    },
} satisfies Command;
