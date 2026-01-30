import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType, EmbedBuilder, MessageFlags } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';
import { getGuildConfig, setGuildConfig } from '../../services/guildConfig.js';

// Migrated from: commands/Birthday/config.js
export default {
    data: new SlashCommandBuilder()
        .setName("config")
        .setDescription("Configuration commands for the bot.")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .setDMPermission(false)
        .addSubcommandGroup((group) =>
            group
                .setName("birthday")
                .setDescription("Manage birthday announcement settings.")
                .addSubcommand((subcommand) =>
                    subcommand
                        .setName("toggle")
                        .setDescription(
                            "Enable or disable birthday announcements by selecting a channel.",
                        )
                        .addChannelOption((option) =>
                            option
                                .setName("channel")
                                .setDescription(
                                    "The text channel for birthday announcements (leave empty to disable).",
                                )
                                .setRequired(false)
                                .addChannelTypes(ChannelType.GuildText),
                        ),
                ),
        ),

    // Command Execution
    async execute(interaction, config, client) {
        if (
            !interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)
        ) {
            return interaction.reply({
                embeds: [
                    errorEmbed(
                        "Permission Denied",
                        "You need the `Manage Server` permission to use this command.",
                    ),
                ],
                flags: MessageFlags.Ephemeral,
            });
        }

        const subcommandGroup = interaction.options.getSubcommandGroup();
        const subcommand = interaction.options.getSubcommand();
        const guildId = interaction.guildId;

        // Get current guild config
        let guildConfig = await getGuildConfig(client, guildId);

        if (subcommandGroup === "birthday") {
            if (subcommand === "toggle") {
                const channel = interaction.options.getChannel("channel");

                try {
                    if (channel) {
                        // Enable birthday announcements
                        guildConfig.birthdayChannelId = channel.id;
                        await setGuildConfig(client, guildId, guildConfig);

                        return interaction.reply({
                            embeds: [
                                successEmbed(
                                    "🎂 Birthday Announcements Enabled",
                                    `Birthday announcements will now be posted in ${channel}.`,
                                ),
                            ],
                            flags: MessageFlags.Ephemeral,
                        });
                    } else {
                        // Disable birthday announcements
                        guildConfig.birthdayChannelId = null;
                        await setGuildConfig(client, guildId, guildConfig);

                        return interaction.reply({
                            embeds: [
                                successEmbed(
                                    "🎂 Birthday Announcements Disabled",
                                    "Birthday announcements have been disabled. No channel selected.",
                                ),
                            ],
                            flags: MessageFlags.Ephemeral,
                        });
                    }
                } catch (error) {
                    console.error(
                        `Error toggling birthday system in ${guildId}:`,
                        error,
                    );
                    return interaction.reply({
                        embeds: [
                            errorEmbed(
                                "Configuration Failed",
                                "Could not save the birthday configuration to the database.",
                            ),
                        ],
                        flags: MessageFlags.Ephemeral,
                    });
                }
            }
        }
    },
};

