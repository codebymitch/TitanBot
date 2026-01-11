import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';

// Map priority levels to prefixes and colors
const PRIORITY_MAP = {
    urgent: { prefix: "🔴-urgent-", color: 0xe74c3c }, // Red
    high: { prefix: "🟠-high-", color: 0xf39c12 }, // Orange
    medium: { prefix: "🟡-medium-", color: 0xf1c40f }, // Yellow
    low: { prefix: "🟢-low-", color: 0x2ecc71 }, // Green
    none: { prefix: "⚪-", color: 0x95a5a6 }, // White/Grey
};
// Migrated from: commands/Ticket/priority.js
export default {
    data: new SlashCommandBuilder()
        .setName("priority")
        .setDescription(
            "Sets the priority level for the current support ticket.",
        )
        .addStringOption((option) =>
            option
                .setName("level")
                .setDescription("The priority level for the ticket.")
                .setRequired(true)
                .addChoices(
                    { name: "🔴 Urgent", value: "urgent" },
                    { name: "🟠 High", value: "high" },
                    { name: "🟡 Medium", value: "medium" },
                    { name: "🟢 Low", value: "low" },
                    { name: "⚪ None", value: "none" },
                ),
        )
        // 💡 Staff permission check (Example: Kick Members or manage channels)
        .setDefaultMemberPermissions(PermissionsBitField.Flags.KickMembers)
        .setDMPermission(false),
    category: "Ticket",

    /**
     * @param {import('discord.js').ChatInputCommandInteraction} interaction
     */
    async execute(interaction, config, client) {
        await interaction.deferReply({ ephemeral: true });

        // 1. Check if the command is run in a valid ticket channel
        const openerId = isTicketChannel(interaction.channel);
        if (!openerId) {
            return interaction.editReply({
                embeds: [
                    errorEmbed(
                        "Not a Ticket",
                        "This command must be run in a valid ticket channel.",
                    ),
                ],
            });
        }

        const priorityLevel = interaction.options.getString("level");
        const priorityData = PRIORITY_MAP[priorityLevel];

        try {
            const currentChannelName = interaction.channel.name;
            const currentPrefix = Object.values(PRIORITY_MAP)
                .map((p) => p.prefix)
                .find((p) => currentChannelName.startsWith(p));

            let newChannelName = currentChannelName;

            if (currentPrefix) {
                newChannelName = currentChannelName.replace(currentPrefix, "");
            } else {
                newChannelName = newChannelName.replace("ticket-", "");
            }

            // Apply new priority prefix
            const newName = `${priorityData.prefix}${newChannelName}`;

            // 2. Rename the channel
            await interaction.channel.setName(newName);

            await updateTicketMessage(
                interaction.channel,
                null,
                null,
                null,
                null,
                priorityLevel,
            );

            // 4. Send success reply
            return interaction.editReply({
                embeds: [
                    successEmbed(
                        "Priority Updated",
                        `Ticket priority set to **${priorityLevel.toUpperCase()}**. Channel renamed to \`#${newName}\`.`,
                    ),
                ],
            });
        } catch (error) {
            console.error(
                `Error setting priority for ticket ${interaction.channel.id}:`,
                error,
            );
            return interaction.editReply({
                embeds: [
                    errorEmbed(
                        "Action Failed",
                        "Could not rename the channel. Ensure the bot has 'Manage Channels' permission.",
                    ),
                ],
            });
        }
    },
};
