import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';

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
                        .setName("set_channel")
                        .setDescription(
                            "Set the channel for birthday announcements.",
                        )
                        .addChannelOption((option) =>
                            option
                                .setName("channel")
                                .setDescription(
                                    "The text channel for birthday announcements.",
                                )
                                .setRequired(true)
                                .addChannelTypes(ChannelType.GuildText),
                        ),
                )
                .addSubcommand((subcommand) =>
                    subcommand
                        .setName("status")
                        .setDescription(
                            "View the current birthday configuration.",
                        ),
                ),
        ),

    // Command Execution
    async execute(interaction, guildConfig, client) {
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
                ephemeral: true,
            });
        }

        const subcommandGroup = interaction.options.getSubcommandGroup();
        const subcommand = interaction.options.getSubcommand();
        const guildId = interaction.guildId;
        const configKey = getGuildConfigKey(guildId);

        if (subcommandGroup === "birthday") {
            if (subcommand === "set_channel") {
                const channel = interaction.options.getChannel("channel");

                try {
                    // Update the config locally and in the database
                    guildConfig.birthdayChannelId = channel.id;
                    await client.db.set(configKey, guildConfig);

                    return interaction.reply({
                        embeds: [
                            successEmbed(
                                "🎂 Birthday Channel Set",
                                `Birthday announcements will now be posted in ${channel}.`,
                            ),
                        ],
                        ephemeral: true,
                    });
                } catch (error) {
                    console.error(
                        `Error setting birthday channel in ${guildId}:`,
                        error,
                    );
                    return interaction.reply({
                        embeds: [
                            errorEmbed(
                                "Configuration Failed",
                                "Could not save the channel to the database.",
                            ),
                        ],
                        ephemeral: true,
                    });
                }
            } else if (subcommand === "status") {
                const channelId = guildConfig.birthdayChannelId;
                const channelMention = channelId
                    ? `<#${channelId}>`
                    : "`Not set`";

                return interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle("🎂 Birthday Configuration Status")
                            .setDescription(
                                "Current settings for automatic birthday announcements.",
                            )
                            .addFields(
                                {
                                    name: "Announcement Channel",
                                    value: channelMention,
                                    inline: false,
                                },
                                {
                                    name: "Status",
                                    value: channelId
                                        ? "✅ Enabled"
                                        : "⚠️ Disabled (No channel set)",
                                    inline: false,
                                },
                            )
                            .setColor("#F39C12"), // Orange color
                    ],
                    ephemeral: true,
                });
            }
        }
    },
};

