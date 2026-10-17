import type { Command } from '../../../types/index.js';
import { SlashCommandBuilder } from 'discord.js';
import shopConfigSetrole from './shop_config_setrole.js';

export default {
    slashOnly: true,
    data: new SlashCommandBuilder()
        .setName('shop-config')
        .setDescription('Shop-Einstellungen konfigurieren. („Server verwalten“ erforderlich)')
        .addSubcommand(subcommand =>
            subcommand
                .setName('setrole')
                .setDescription('Lege die Rolle fest, die beim Kauf des Items „Premium-Rolle“ vergeben wird.')
                .addRoleOption(option =>
                    option
                        .setName('role')
                        .setDescription('Die Rolle, die beim Kauf der Premium-Rolle vergeben wird.')
                        .setRequired(true),
                ),
        ),

    async execute(interaction, config, client) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'setrole') {
            return shopConfigSetrole.execute(interaction, config, client);
        }
    },
} satisfies Command;
