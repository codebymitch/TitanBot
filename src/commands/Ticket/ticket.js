import { SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';

// Migrated from: commands/Ticket/ticket.js
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
                ),
        ),
    category: "ticket",

    async execute(interaction, config, client) {
        await interaction.deferReply({ ephemeral: true });

        // --- Permission Check ---
        if (
            !interaction.member.permissions.has(
                PermissionFlagsBits.ManageChannels,
            )
        )
            return interaction.editReply({
                embeds: [
                    errorEmbed(
                        "Permission Denied",
                        "You need the `Manage Channels` permission for this action.",
                    ),
                ],
            });

        if (interaction.options.getSubcommand() === "setup") {
            // Retrieve options
            const panelChannel =
                interaction.options.getChannel("panel_channel");
            const categoryChannel = interaction.options.getChannel("category");
            const panelMessage = interaction.options.getString("panel_message"); // <-- New
            const buttonLabel =
                interaction.options.getString("button_label") ||
                "Create Ticket"; // <-- New

            const setupEmbed = createEmbed(
                "🎫 Support Tickets",
                panelMessage, // Use the user-provided message
            ).setColor("#3498DB");

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

                    // Save the updated configuration to the database
                    await client.db.set(interaction.guildId, currentConfig);
                    console.log(
                        `[DB] Saved ticketCategoryId and ticketPanelChannelId for guild ${interaction.guildId}`,
                    );
                }

                // --- Success Reply ---
                await interaction.editReply({
                    embeds: [
                        successEmbed(
                            "Ticket Panel Set Up",
                            `The ticket creation panel has been sent to ${panelChannel}. ${categoryChannel ? `New tickets will be created in the **${categoryChannel.name}** category.` : 'New tickets will be created in a new "Tickets" category.'}`,
                        ),
                    ],
                });

                // --- Logging ---
                const logEmbed = createEmbed(
                    "🔧 Ticket System Setup (Configuration Log)",
                    `The ticket panel was set up in ${panelChannel} by ${interaction.user}.`,
                )
                    .setColor("#F39C12")
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
                            name: "Moderator",
                            value: `${interaction.user.tag} (${interaction.user.id})`,
                            inline: false,
                        },
                    );

                logEvent(client, interaction.guildId, logEmbed);
            } catch (error) {
                console.error("Ticket Setup Error:", error);
                await interaction.editReply({
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
};
