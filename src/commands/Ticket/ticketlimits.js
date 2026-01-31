import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getGuildConfig } from '../../services/guildConfig.js';
import { getUserTicketCount } from '../../services/ticket.js';

export default {
    data: new SlashCommandBuilder()
        .setName("ticketlimits")
        .setDescription("Manage or view ticket limits for users")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
        .addSubcommand(subcommand =>
            subcommand
                .setName("view")
                .setDescription("View current ticket limit settings")
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("set")
                .setDescription("Set the maximum number of tickets per user")
                .addIntegerOption(option =>
                    option
                        .setName("max_tickets")
                        .setDescription("Maximum number of tickets a user can create (1-10)")
                        .setMinValue(1)
                        .setMaxValue(10)
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("check")
                .setDescription("Check a user's current ticket count")
                .addUserOption(option =>
                    option
                        .setName("user")
                        .setDescription("The user to check")
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("toggle_dm")
                .setDescription("Toggle DM notifications when tickets are closed")
        ),
    category: "ticket",

    async execute(interaction, config, client) {
        await interaction.deferReply({ flags: ["Ephemeral"] });

        // Permission check
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
            return interaction.editReply({
                embeds: [
                    errorEmbed(
                        "Permission Denied",
                        "You need the `Manage Channels` permission for this action."
                    ),
                ],
            });
        }

        const subcommand = interaction.options.getSubcommand();
        const guildId = interaction.guildId;

        try {
            const currentConfig = await getGuildConfig(client, guildId);
            const maxTicketsPerUser = currentConfig.maxTicketsPerUser || 3;

            switch (subcommand) {
                case "view":
                    return await handleViewLimits(interaction, maxTicketsPerUser, client, guildId);

                case "set":
                    const newMaxTickets = interaction.options.getInteger("max_tickets");
                    return await handleSetLimits(interaction, currentConfig, newMaxTickets, client, guildId);

                case "check":
                    const targetUser = interaction.options.getUser("user");
                    return await handleCheckUser(interaction, targetUser, maxTicketsPerUser, client, guildId);

                case "toggle_dm":
                    return await handleToggleDM(interaction, currentConfig, client, guildId);

                default:
                    return interaction.editReply({
                        embeds: [
                            errorEmbed(
                                "Invalid Subcommand",
                                "Please select a valid subcommand."
                            ),
                        ],
                    });
            }
        } catch (error) {
            console.error("Error in ticketlimits command:", error);
            return interaction.editReply({
                embeds: [
                    errorEmbed(
                        "System Error",
                        "An error occurred while processing your request. Please try again later."
                    ),
                ],
            });
        }
    }
};

async function handleViewLimits(interaction, maxTicketsPerUser, client, guildId) {
    // Get total open tickets count
    const { getUserTicketCount } = await import('../../services/ticket.js');
    
    // Get guild config for DM setting
    const { getGuildConfig } = await import('../../services/guildConfig.js');
    const config = await getGuildConfig(client, guildId);
    const dmOnClose = config.dmOnClose !== false; // Default to true
    
    // Count total tickets in the server
    let totalTickets = 0;
    try {
        // Get all ticket keys for this guild
        const { getFromDb } = await import('../../services/database.js');
        const ticketKeys = await getFromDb(`guild:${guildId}:ticket:*`, {});
        const allKeys = Object.keys(ticketKeys);
        
        for (const key of allKeys) {
            try {
                const ticketData = await getFromDb(key, null);
                if (ticketData && ticketData.status === 'open') {
                    totalTickets++;
                }
            } catch (error) {
                continue;
            }
        }
    } catch (error) {
        console.error('Error counting total tickets:', error);
    }

    return interaction.editReply({
        embeds: [
            infoEmbed(
                "🎫 Ticket Limit Settings",
                `**Maximum Tickets Per User:** ${maxTicketsPerUser}\n` +
                `**DM on Close:** ${dmOnClose ? 'Enabled' : 'Disabled'}\n` +
                `**Total Open Tickets:** ${totalTickets}\n` +
                `**Guild ID:** ${guildId}`
            )
        ]
    });
}

async function handleSetLimits(interaction, currentConfig, newMaxTickets, client, guildId) {
    currentConfig.maxTicketsPerUser = newMaxTickets;

    // Save the updated configuration
    await client.db.set(guildId, currentConfig);
    console.log(`[DB] Updated maxTicketsPerUser to ${newMaxTickets} for guild ${guildId}`);

    return interaction.editReply({
        embeds: [
            successEmbed(
                "🎫 Ticket Limit Updated",
                `Maximum tickets per user has been set to **${newMaxTickets}**.\n\n` +
                `**Updated by:** ${interaction.user.tag}\n` +
                `**Previous limit:** ${currentConfig.maxTicketsPerUser || 3}`
            )
        ]
    });
}

async function handleCheckUser(interaction, targetUser, maxTicketsPerUser, client, guildId) {
    const { getUserTicketCount } = await import('../../services/ticket.js');
    const currentTicketCount = await getUserTicketCount(guildId, targetUser.id);
    const remainingTickets = maxTicketsPerUser - currentTicketCount;

    const status = currentTicketCount >= maxTicketsPerUser ? "🔴 Limit Reached" : 
                   currentTicketCount >= maxTicketsPerUser * 0.8 ? "🟡 Near Limit" : "🟢 Available";

    return interaction.editReply({
        embeds: [
            infoEmbed(
                `🎫 ${targetUser.tag}'s Ticket Status`,
                `**Current Tickets:** ${currentTicketCount}/${maxTicketsPerUser}\n` +
                `**Remaining Tickets:** ${remainingTickets}\n` +
                `**Status:** ${status}\n\n` +
                `**User ID:** ${targetUser.id}`
            )
        ]
    });
}

async function handleToggleDM(interaction, currentConfig, client, guildId) {
    const currentDMSetting = currentConfig.dmOnClose !== false; // Default to true
    const newDMSetting = !currentDMSetting;
    
    currentConfig.dmOnClose = newDMSetting;
    
    // Save the updated configuration
    await client.db.set(guildId, currentConfig);
    console.log(`[DB] Updated dmOnClose to ${newDMSetting} for guild ${guildId}`);

    return interaction.editReply({
        embeds: [
            successEmbed(
                "🎫 DM Setting Updated",
                `DM notifications on ticket close have been **${newDMSetting ? 'ENABLED' : 'DISABLED'}**.\n\n` +
                `**Updated by:** ${interaction.user.tag}\n` +
                `**Previous setting:** ${currentDMSetting ? 'Enabled' : 'Disabled'}`
            )
        ]
    });
}
