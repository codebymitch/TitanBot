import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';
import { updateTicketPriority } from '../../services/ticket.js';
import { logEvent } from '../../utils/moderation.js';

export default {
    data: new SlashCommandBuilder()
        .setName("priority")
        .setDescription("Sets the priority level for the current support ticket.")
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
        .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
        .setDMPermission(false),
    category: "Ticket",

    async execute(interaction, guildConfig, client) {
        await interaction.deferReply({ ephemeral: true });

        const priorityLevel = interaction.options.getString("level");

        try {
            // Use the new ticket system to update priority
            const result = await updateTicketPriority(interaction.channel, priorityLevel, interaction.user);
            
            if (!result.success) {
                return interaction.editReply({
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
                        "Priority Updated",
                        `Ticket priority set to **${priorityLevel.toUpperCase()}**.`,
                    ),
                ],
            });

            // Log the event
            const logEmbed = createEmbed({
                title: "📊 Priority Updated (Audit Log)",
                description: `${interaction.user} updated ticket priority to **${priorityLevel.toUpperCase()}**.`,
                color: "#F39C12",
                fields: [
                    {
                        name: "Updated By",
                        value: interaction.user.tag,
                        inline: true,
                    },
                    {
                        name: "Channel",
                        value: interaction.channel.toString(),
                        inline: true,
                    },
                    {
                        name: "Priority",
                        value: priorityLevel.toUpperCase(),
                        inline: true,
                    },
                ]
            });

            await logEvent({
                client,
                guildId: interaction.guildId,
                event: {
                    action: "Priority Updated",
                    target: interaction.channel.toString(),
                    executor: interaction.user.toString(),
                    reason: `Priority set to ${priorityLevel.toUpperCase()}`
                }
            });

        } catch (error) {
            console.error(`Error setting priority for ticket ${interaction.channel.id}:`, error);
            return interaction.editReply({
                embeds: [
                    errorEmbed(
                        "Action Failed",
                        "Could not update ticket priority. Please check the bot's console for details.",
                    ),
                ],
            });
        }
    },
};
