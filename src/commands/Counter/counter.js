import { getColor } from '../../config/bot.js';
import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';

import { handleCreate } from './modules/counter_create.js';
import { handleList } from './modules/counter_list.js';
import { handleUpdate } from './modules/counter_update.js';
import { handleDelete } from './modules/counter_delete.js';

export default {
    data: new SlashCommandBuilder()
        .setName("counter")
        .setDescription("Manage server counters that track statistics in channel names")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
        .addSubcommand(subcommand =>
            subcommand
                .setName("create")
                .setDescription("Create a new counter for a channel")
                .addStringOption(option =>
                    option
                        .setName("type")
                        .setDescription("The type of counter to create")
                        .setRequired(true)
                        .addChoices(
                            { name: "members and bots", value: "members" },
                            { name: "members only", value: "members_only" },
                            { name: "bots only", value: "bots" }
                        )
                )
                .addStringOption(option =>
                    option
                        .setName("channel")
                        .setDescription("The channel type for the counter")
                        .setRequired(true)
                        .addChoices(
                            { name: "voice channel (recommended)", value: "voice" },
                            { name: "text channel", value: "text" }
                        )
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("list")
                .setDescription("List all counters for this server")
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("update")
                .setDescription("Update an existing counter")
                .addStringOption(option =>
                    option
                        .setName("counter-id")
                        .setDescription("The ID of the counter to update")
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName("type")
                        .setDescription("The new counter type")
                        .setRequired(false)
                        .addChoices(
                            { name: "members and bots", value: "members" },
                            { name: "members only", value: "members_only" },
                            { name: "bots only", value: "bots" }
                        )
                )
                .addChannelOption(option =>
                    option
                        .setName("channel")
                        .setDescription("The new channel for the counter")
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("delete")
                .setDescription("Delete an existing counter")
                .addStringOption(option =>
                    option
                        .setName("counter-id")
                        .setDescription("The ID of the counter to delete")
                        .setRequired(true)
                )
        ),

    async execute(interaction, guildConfig, client) {
        const subcommand = interaction.options.getSubcommand();

        try {
            switch (subcommand) {
                case "create":
                    await handleCreate(interaction, client);
                    break;
                case "list":
                    await handleList(interaction, client);
                    break;
                case "update":
                    await handleUpdate(interaction, client);
                    break;
                case "delete":
                    await handleDelete(interaction, client);
                    break;
                default:
                    await interaction.reply({
                        embeds: [errorEmbed("Unknown subcommand.")],
                        flags: MessageFlags.Ephemeral
                    });
            }
        } catch (error) {
            logger.error(`Error in counter ${subcommand}:`, error);
            
            const errorEmbedMsg = createEmbed({ 
                title: "❌ Error", 
                description: "An error occurred while processing your request.",
                color: getColor('error')
            });

            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ embeds: [errorEmbedMsg], flags: MessageFlags.Ephemeral }).catch(logger.error);
            } else {
                await interaction.followUp({ embeds: [errorEmbedMsg], flags: MessageFlags.Ephemeral }).catch(logger.error);
            }
        }
    }
};




