import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { errorEmbed } from '../../utils/embeds.js';

// Import all counter command functions
import counterCreate from './modules/counter_create.js';
import counterDelete from './modules/counter_delete.js';
import counterList from './modules/counter_list.js';
import counterUpdate from './modules/counter_update.js';

export default {
    data: new SlashCommandBuilder()
        .setName("counter")
        .setDescription("Manage server stats counters")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .setDMPermission(false)
        .addSubcommand((subcommand) =>
            subcommand
                .setName("create")
                .setDescription("Create a new server stats counter")
                .addStringOption((option) =>
                    option
                        .setName("type")
                        .setDescription("Type of counter to create")
                        .setRequired(true)
                        .addChoices(
                            { name: "All Members", value: "members" },
                            { name: "Bots Only", value: "bots" },
                            { name: "Humans Only", value: "members_only" },
                        ),
                )
                .addStringOption((option) =>
                    option
                        .setName("channeltype")
                        .setDescription("Type of channel to create for the counter")
                        .setRequired(true)
                        .addChoices(
                            { name: "Voice Channel", value: "voice" },
                            { name: "Text Channel", value: "text" },
                        ),
                ),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("delete")
                .setDescription("Delete a server stats counter")
                .addStringOption((option) =>
                    option
                        .setName("counter_id")
                        .setDescription(
                            "The ID of the counter to delete (use /counter list to find IDs)",
                        )
                        .setRequired(true),
                ),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("list")
                .setDescription("List all active server stats counters"),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("update")
                .setDescription("Update all server stats counters"),
        ),

    async execute(interaction, config, client) {
        try {
            const subcommand = interaction.options.getSubcommand();

            switch (subcommand) {
                case 'create':
                    return counterCreate.execute(interaction, config, client);
                case 'delete':
                    return counterDelete.execute(interaction, config, client);
                case 'list':
                    return counterList.execute(interaction, config, client);
                case 'update':
                    return counterUpdate.execute(interaction, config, client);
                default:
                    return interaction.reply({
                        embeds: [errorEmbed('Error', 'Unknown subcommand')],
                        flags: { ephemeral: true }
                    });
            }
        } catch (error) {
            console.error('Counter command error:', error);
            return interaction.reply({
                embeds: [errorEmbed('System Error', 'Could not process counter command.')],
                ephemeral: true,
            });
        }
    },
};
