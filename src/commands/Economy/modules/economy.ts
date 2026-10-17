import type { Command } from '../../../types/index.js';
import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { logger } from '../../../utils/logger.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import economyDashboard from './economy_dashboard.js';

export default {
    slashOnly: true,
    data: new SlashCommandBuilder()
        .setName('economy')
        .setDescription('Commands zur Verwaltung der Wirtschaft')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .setDMPermission(false)
        .addSubcommand(subcommand =>
            subcommand
                .setName('dashboard')
                .setDescription('Öffne das Wirtschafts-Dashboard')
        ),
    category: 'Economy',

    async execute(interaction, config, client) {
        const deferred = await InteractionHelper.safeDefer(interaction, {
            flags: MessageFlags.Ephemeral,
        });
        if (!deferred) return;

        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'dashboard') {
            await economyDashboard.execute(interaction, config, client);
        }
    }
} satisfies Command;
