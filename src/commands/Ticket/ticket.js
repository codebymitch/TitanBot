import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';
import { getGuildConfig } from '../../services/guildConfig.js';
import { logEvent } from '../../utils/moderation.js';

// Import ticket limits modules (now removed – view moved to logstatus)
// import ticketLimitsView from './modules/ticket_limits_view.js';
import ticketLimitsSet from './modules/ticket_limits_set.js';
import ticketLimitsCheck from './modules/ticket_limits_check.js';
import ticketLimitsToggleDM from './modules/ticket_limits_toggle_dm.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
export default {
    data: new SlashCommandBuilder()
        .setName("ticket")
        .setDescription("Manages the server's ticket system.")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
        .addSubcommand((subcommand) =>
            subcommand
                .setName("setup")
                .setDescription(
                    "Sets up the ticket creation panel in a specified channel.",
                )
                .addChannelOption((option) =>
                    option
                        .setName("panel_channel") // Option for the panel location
                        .setDescription(
                            "The channel where the ticket panel will be sent.",
                        )
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true),
                )

                .addStringOption((option) =>
                    option
                        .setName("panel_message")
                        .setDescription(
                            "The main message/description for the ticket panel.",
                        )
                        .setRequired(true),
                )
                .addStringOption((option) =>
                    option
                        .setName("button_label")
                        .setDescription(
                            "The label for the ticket creation button (default: Create Ticket)",
                        )
                        .setRequired(false),
                )
                // Existing Category Option
                .addChannelOption((option) =>
                    option
                        .setName("category")
                        .setDescription(
                            "The category where new tickets will be created (optional).",
                        )
                        .addChannelTypes(ChannelType.GuildCategory)
                        .setRequired(false),
                )
                .addIntegerOption((option) =>
                    option
                        .setName("max_tickets_per_user")
                        .setDescription("Maximum number of tickets a user can create (default: 3)")
                        .setMinValue(1)
                        .setMaxValue(10)
                        .setRequired(false),
                )
                .addBooleanOption((option) =>
                    option
                        .setName("dm_on_close")
                        .setDescription("Send DM to user when their ticket is closed (default: true)")
                        .setRequired(false),
                ),
        )
        .addSubcommandGroup((group) =>
            group
                .setName("limits")
                .setDescription("Manage ticket limits and settings")
                .addSubcommand((subcommand) =>
                    subcommand
                        .setName("set")
                        .setDescription("Set the maximum number of tickets per user")
                        .addIntegerOption((option) =>
                            option
                                .setName("max_tickets")
                                .setDescription("Maximum number of tickets a user can create (1-10)")
                                .setMinValue(1)
                                .setMaxValue(10)
                                .setRequired(true)
                        )
                )
                .addSubcommand((subcommand) =>
                    subcommand
                        .setName("check")
                        .setDescription("Check a user's current ticket count")
                        .addUserOption((option) =>
                            option
                                .setName("user")
                                .setDescription("The user to check")
                                .setRequired(true)
                        )
                )
                .addSubcommand((subcommand) =>
                    subcommand
                        .setName("toggle_dm")
                        .setDescription("Toggle DM notifications when tickets are closed")
                )
        ),
    category: "ticket",

    async execute(interaction, config, client) {
    await InteractionHelper.safeExecute(
        interaction,
        async () => {
        // safeExecute already defers; don't defer again

        // --- Permission Check ---
        if (
            !interaction.member.permissions.has(
                PermissionFlagsBits.ManageChannels,
            )
        )
            return await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    errorEmbed(
                        "Permission Denied",
                        "You need the `Manage Channels` permission for this action.",
                    ),
                ],
            });

        const subcommand = interaction.options.getSubcommand();
        const subcommandGroup = interaction.options.getSubcommandGroup();

        if (subcommandGroup === "limits") {
            // Handle limits subcommands (view removed; others remain)
            switch (subcommand) {
                case "set":
                    return ticketLimitsSet.execute(interaction, config, client);
                case "check":
                    return ticketLimitsCheck.execute(interaction, config, client);
                case "toggle_dm":
                    return ticketLimitsToggleDM.execute(interaction, config, client);
                default:
                    return interaction.editReply({
                        embeds: [
                            errorEmbed(
                                "Invalid Subcommand",
                                "Please select a valid limits subcommand."
                            ),
                        ],
                    });
            }
        }

        if (subcommand === "setup") {
            // Retrieve options
            const panelChannel =
                interaction.options.getChannel("panel_channel");
            const categoryChannel = interaction.options.getChannel("category");
            const panelMessage = interaction.options.getString("panel_message") || "Click the button below to create a support ticket."; // <-- New
            const buttonLabel =
                interaction.options.getString("button_label") ||
                "Create Ticket"; // <-- New
            const maxTicketsPerUser = interaction.options.getInteger("max_tickets_per_user") || 3;
            const dmOnClose = interaction.options.getBoolean("dm_on_close") !== false; // Default to true

            const setupEmbed = createEmbed({ 
                title: "🎫 Support Tickets", 
                description: panelMessage, // Removed the max tickets text from here
                color: "#3498DB"
            });

            const ticketButton = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId("create_ticket")
                    .setLabel(buttonLabel) // Use the user-provided label
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji("📩"),
            );

            try {
                // Send the panel to the specified channel
                await panelChannel.send({
                    embeds: [setupEmbed],
                    components: [ticketButton],
                });

                // --- Configuration Saving ---
                if (categoryChannel && client.db && interaction.guildId) {
                    const currentConfig = await getGuildConfig(
                        client,
                        interaction.guildId,
                    );
                    // Save the ID of the category channel
                    currentConfig.ticketCategoryId = categoryChannel.id;
                    currentConfig.ticketPanelChannelId = panelChannel.id;
                    currentConfig.maxTicketsPerUser = maxTicketsPerUser;
                    currentConfig.dmOnClose = dmOnClose;

                    // Save the updated configuration to the database using the proper guild config key
                    const { getGuildConfigKey } = await import('../../utils/database.js');
                    const configKey = getGuildConfigKey(interaction.guildId);
                    await client.db.set(configKey, currentConfig);
                    console.log(
                        `[DB] Saved ticketCategoryId, ticketPanelChannelId, maxTicketsPerUser, and dmOnClose for guild ${interaction.guildId}`,
                    );
                }

                // --- Success Reply ---
                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [
                        successEmbed(
                            "Ticket Panel Set Up",
                            `The ticket creation panel has been sent to ${panelChannel}. ${categoryChannel ? `New tickets will be created in the **${categoryChannel.name}** category.` : 'New tickets will be created in a new "Tickets" category.'}\n\n**Max Tickets Per User:** ${maxTicketsPerUser}\n**DM on Close:** ${dmOnClose ? 'Enabled' : 'Disabled'}`,
                        ),
                    ],
                });

                // --- Logging ---
                const logEmbed = createEmbed({
                    title: "🔧 Ticket System Setup (Configuration Log)",
                    description: `The ticket panel was set up in ${panelChannel} by ${interaction.user}.`,
                    color: "#F39C12"
                })
                    .addFields(
                        {
                            name: "Panel Channel",
                            value: panelChannel.toString(),
                            inline: true,
                        },
                        {
                            name: "Category ID Stored",
                            value: categoryChannel
                                ? categoryChannel.id
                                : "None specified.",
                            inline: true,
                        },
                        {
                            name: "Max Tickets Per User",
                            value: maxTicketsPerUser.toString(),
                            inline: true,
                        },
                        {
                            name: "DM on Close",
                            value: dmOnClose ? 'Enabled' : 'Disabled',
                            inline: true,
                        },
                        {
                            name: "Moderator",
                            value: `${interaction.user.tag} (${interaction.user.id})`,
                            inline: false,
                        },
                    );

                logEvent({
                    client,
                    guildId: interaction.guildId,
                    event: {
                        action: "Ticket System Setup",
                        target: panelChannel.toString(),
                        executor: interaction.user.toString(),
                        reason: "Ticket panel configuration"
                    }
                });
            } catch (error) {
                console.error("Ticket Setup Error:", error);
                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [
                        errorEmbed(
                            "Setup Failed",
                            "Could not send the ticket panel or save configuration. Check the bot's permissions (especially the ability to send messages in the target channel) and database connection.",
                        ),
                    ],
                });
            }
        }
    
        },
        { title: 'Command Error', description: 'Failed to execute command. Please try again later.' }
    );
},
};
