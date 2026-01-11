import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';

// Migrated from: commands/Ticket/close.js
export default {
    data: new SlashCommandBuilder()
        .setName("close")
        .setDescription("Closes and archives the current ticket.")
        .setDMPermission(false)
        .addStringOption((option) =>
            option
                .setName("reason")
                .setDescription("The reason for closing the ticket.")
                .setRequired(false),
        ),

    /**
     * @param {import('discord.js').ChatInputCommandInteraction | import('discord.js').ButtonInteraction} interaction
     * @param {object} guildConfig
     * @param {import('discord.js').Client} client
     */
    async execute(interaction, guildConfig, client) {
        // Defer reply immediately
        await interaction.deferReply({ ephemeral: true });

        const channel = interaction.channel;
        const reason =
            interaction.options?.getString("reason") ||
            "Closed via button/command without a specific reason.";

        // --- 1. TICKET VALIDATION ---
        const ticketOwnerId = isTicketChannel(channel);
        if (!ticketOwnerId) {
            return interaction.editReply({
                embeds: [
                    errorEmbed(
                        "Not a Ticket Channel",
                        "This command can only be used in a valid ticket channel (identified by the channel topic).",
                    ),
                ],
            });
        }

        // --- 2. PERMISSION CHECK ---
        const isMod = interaction.member.permissions.has(
            PermissionFlagsBits.KickMembers,
        );
        const isOwner = interaction.user.id === ticketOwnerId;

        // Allow closing only by moderators (isMod) OR the original owner (isOwner)
        if (!isMod && !isOwner) {
            return interaction.editReply({
                embeds: [
                    errorEmbed(
                        "Permission Denied",
                        "Only the ticket opener or a moderator can close this ticket.",
                    ),
                ],
            });
        }

        // --- 3. CHANNEL STATE TRANSITION (Closing Process) ---
        try {
            // First, update the welcome message to reflect the closed state and disable buttons
            await updateTicketMessage(
                channel,
                true,
                null,
                true,
                interaction.user,
            );

            // Optional: Send a final closing message in the channel
            await channel
                .send({
                    embeds: [
                        createEmbed(
                            // <--- This line required the import fix
                            "Ticket Closing...",
                            `This ticket was closed by ${interaction.user}. Archiving in 10 seconds.`,
                        ).setColor("#E74C3C"),
                    ],
                })
                .catch((e) =>
                    console.error("Failed to send closing message:", e),
                );

            // Set a successful reply
            await interaction.editReply({
                embeds: [
                    successEmbed(
                        "Ticket Closed!",
                        `This ticket is now closed and will be archived shortly.`,
                    ),
                ],
            });

            // --- 4. LOGGING AND ARCHIVING ---
            const logEmbed = createEmbed(
                "🔒 Ticket Closed (Audit Log)",
                `${channel} was closed by ${interaction.user}.`,
            )
                .setColor("#FF0000")
                .addFields(
                    {
                        name: "Closed By",
                        value: interaction.user.tag,
                        inline: true,
                    },
                    { name: "Reason", value: reason, inline: false },
                    {
                        name: "Channel",
                        value: channel.toString(),
                        inline: true,
                    },
                    {
                        name: "Ticket Opener",
                        value: `<@${ticketOwnerId}>`,
                        inline: true,
                    },
                );

            await logEvent(
                client,
                interaction.guildId,
                logEmbed,
                guildConfig,
                channel.id,
                interaction.user.id,
            );

            // Wait 10 seconds before deleting/archiving the channel
            await new Promise((resolve) => setTimeout(resolve, 10000));

            // Rename the channel to indicate closure (e.g., closed-ticket-...)
            const newName = `closed-${channel.name.replace("ticket-", "")}`;
            await channel
                .setName(newName)
                .catch((e) => console.error("Failed to rename channel:", e));

            await channel
                .delete()
                .catch((e) => console.error("Failed to delete channel:", e));
        } catch (error) {
            console.error(`Error closing ticket ${channel.id}:`, error);
            await interaction.editReply({
                embeds: [
                    errorEmbed(
                        "Close Failed",
                        "Could not close the ticket due to an internal error (e.g., permission issue when deleting/renaming).",
                    ),
                ],
            });
        }
    },
};
