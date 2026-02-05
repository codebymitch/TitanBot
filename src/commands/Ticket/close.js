import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';
import { closeTicket } from '../../services/ticket.js';
import { logEvent } from '../../utils/moderation.js';
export default {
    data: new SlashCommandBuilder()
        .setName("close")
        .setDescription("Closes the current ticket.")
        .setDMPermission(false)
        .addStringOption((option) =>
            option
                .setName("reason")
                .setDescription("The reason for closing the ticket.")
                .setRequired(false),
        ),

    async execute(interaction, guildConfig, client) {
const channel = interaction.channel;
        const reason =
            interaction.options?.getString("reason") ||
            "Closed via command without a specific reason.";

        try {
            // Use the new ticket system to close the ticket
            const result = await closeTicket(channel, interaction.user, reason);
            
            if (!result.success) {
                return interaction.reply({
                    embeds: [
                        errorEmbed(
                            "Not a Ticket Channel",
                            result.error || "This command can only be used in a valid ticket channel.",
                        ),
                    ],
                });
            }

            await interaction.editReply({
                embeds: [
                    successEmbed(
                        "Ticket Closed!",
                        "This ticket has been closed successfully.",
                    ),
                ],
            });

            // Log the event
            const logEmbed = createEmbed({
                title: "🔒 Ticket Closed (Audit Log)",
                description: `${channel} was closed by ${interaction.user}.`,
                color: "#FF0000",
                fields: [
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
                ]
            });

            await logEvent({
                client,
                guildId: interaction.guildId,
                event: {
                    action: "Ticket Closed",
                    target: channel.toString(),
                    executor: interaction.user.toString(),
                    reason: reason
                }
            });

        } catch (error) {
            console.error(`Error closing ticket ${channel.id}:`, error);
            await interaction.editReply({
                embeds: [
                    errorEmbed(
                        "Close Failed",
                        "Could not close the ticket due to an internal error.",
                    ),
                ],
            });
        }
    },
};
