import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, ChannelType } from 'discord.js';
import { errorEmbed } from '../../utils/embeds.js';

// Import all config command functions
import birthdayToggle from './modules/config_birthday_toggle.js';
import loggingStatus from './modules/config_logging_status.js';
import loggingSetchannel from './modules/config_logging_setchannel.js';
import loggingFilter from './modules/config_logging_filter.js';
import reportsSetchannel from './modules/config_reports_setchannel.js';
import premiumSetrole from './modules/config_premium_setrole.js';

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
        )
        .addSubcommandGroup((group) =>
            group
                .setName("logging")
                .setDescription("Manage logging configuration.")
                .addSubcommand((subcommand) =>
                    subcommand
                        .setName("status")
                        .setDescription("Display current logging configuration."),
                )
                .addSubcommand((subcommand) =>
                    subcommand
                        .setName("setchannel")
                        .setDescription("Sets the channel where bot moderation and audit logs are sent.")
                        .addChannelOption((option) =>
                            option
                                .setName("channel")
                                .setDescription("The text channel to use for logging.")
                                .addChannelTypes(ChannelType.GuildText)
                                .setRequired(false),
                        )
                        .addChannelOption((option) =>
                            option
                                .setName("ticket_lifecycle")
                                .setDescription("The channel for ticket lifecycle events (open, close, delete, claim, etc.).")
                                .addChannelTypes(ChannelType.GuildText)
                                .setRequired(false),
                        )
                        .addChannelOption((option) =>
                            option
                                .setName("ticket_transcript")
                                .setDescription("The channel for ticket transcript logs.")
                                .addChannelTypes(ChannelType.GuildText)
                                .setRequired(false),
                        )
                        .addBooleanOption((option) =>
                            option
                                .setName("disable")
                                .setDescription("Set to True to disable logging completely.")
                                .setRequired(false),
                        ),
                )
                .addSubcommand((subcommand) =>
                    subcommand
                        .setName("add")
                        .setDescription("Adds a user or channel to the ignore list.")
                        .addStringOption((option) =>
                            option
                                .setName("type")
                                .setDescription("The type of entity to ignore.")
                                .setRequired(true)
                                .addChoices(
                                    { name: "User", value: "user" },
                                    { name: "Channel", value: "channel" },
                                ),
                        )
                        .addStringOption((option) =>
                            option
                                .setName("id")
                                .setDescription("The ID of the User or Channel to ignore.")
                                .setRequired(true),
                        ),
                )
                .addSubcommand((subcommand) =>
                    subcommand
                        .setName("remove")
                        .setDescription("Removes a user or channel from the ignore list.")
                        .addStringOption((option) =>
                            option
                                .setName("type")
                                .setDescription("The type of entity to stop ignoring.")
                                .setRequired(true)
                                .addChoices(
                                    { name: "User", value: "user" },
                                    { name: "Channel", value: "channel" },
                                ),
                        )
                        .addStringOption((option) =>
                            option
                                .setName("id")
                                .setDescription("The ID of the User or Channel to remove from the ignore list.")
                                .setRequired(true),
                        ),
                ),
        )
        .addSubcommandGroup((group) =>
            group
                .setName("reports")
                .setDescription("Manage report configuration.")
                .addSubcommand((subcommand) =>
                    subcommand
                        .setName("setchannel")
                        .setDescription("Sets the channel where user reports will be sent.")
                        .addChannelOption((option) =>
                            option
                                .setName("channel")
                                .setDescription("The text channel to send reports to.")
                                .addChannelTypes(ChannelType.GuildText)
                                .setRequired(true),
                        ),
                ),
        )
        .addSubcommandGroup((group) =>
            group
                .setName("premium")
                .setDescription("Manage premium role configuration.")
                .addSubcommand((subcommand) =>
                    subcommand
                        .setName("setrole")
                        .setDescription("Sets the Discord role granted when the Premium Role shop item is purchased.")
                        .addRoleOption((option) =>
                            option
                                .setName("role")
                                .setDescription("The role to be designated as the Premium Shop Role.")
                                .setRequired(true),
                        ),
                ),
        ),

    async execute(interaction, config, client) {
// Check permissions before deferring
        if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) {
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

        try {
            if (subcommandGroup === "birthday") {
                if (subcommand === "toggle") {
                    return birthdayToggle.execute(interaction, config, client);
                }
            } else if (subcommandGroup === "logging") {
                if (subcommand === "status") {
                    return loggingStatus.execute(interaction, config, client);
                } else if (subcommand === "setchannel") {
                    return loggingSetchannel.execute(interaction, config, client);
                } else if (subcommand === "add" || subcommand === "remove") {
                    return loggingFilter.execute(interaction, config, client);
                }
            } else if (subcommandGroup === "reports") {
                if (subcommand === "setchannel") {
                    return reportsSetchannel.execute(interaction, config, client);
                }
            } else if (subcommandGroup === "premium") {
                if (subcommand === "setrole") {
                    return premiumSetrole.execute(interaction, config, client);
                }
            }

            return interaction.editReply({
                embeds: [
                    errorEmbed("Error", "Unknown subcommand or subcommand group."),
                ],
                flags: MessageFlags.Ephemeral,
            });
        } catch (error) {
            console.error("Config command error:", error);
            
            // Handle based on interaction state
            const errorMessage = {
                embeds: [
                    errorEmbed(
                        "Configuration Failed",
                        "Could not save the configuration to the database.",
                    ),
                ],
                flags: MessageFlags.Ephemeral,
            };
            
            if (interaction.deferred || interaction.replied) {
                return interaction.editReply(errorMessage);
            } else {
                return interaction.editReply(errorMessage);
            }
        }
    },
};
