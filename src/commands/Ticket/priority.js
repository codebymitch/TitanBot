import { getColor } from '../../config/bot.js';
import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType, MessageFlags } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { updateTicketPriority } from '../../services/ticket.js';
import { logEvent } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

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
        try {
            
            const deferred = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
            if (!deferred) {
                return;
            }

            const priorityLevel = interaction.options.getString("level");
            const result = await updateTicketPriority(interaction.channel, priorityLevel, interaction.user);
            
            if (!result.success) {
                logger.warn('Priority update failed - not a valid ticket channel', {
                    userId: interaction.user.id,
                    channelId: interaction.channel.id,
                    guildId: interaction.guildId,
                    error: result.error
                });
                return await interaction.editReply({
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

            logger.info('Ticket priority updated successfully', {
                userId: interaction.user.id,
                userTag: interaction.user.tag,
                channelId: interaction.channel.id,
                channelName: interaction.channel.name,
                guildId: interaction.guildId,
                priority: priorityLevel,
                commandName: 'priority'
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
            logger.error('Error executing priority command', {
                error: error.message,
                stack: error.stack,
                userId: interaction.user.id,
                channelId: interaction.channel?.id,
                guildId: interaction.guildId,
                commandName: 'priority'
            });
            await handleInteractionError(interaction, error, {
                commandName: 'priority',
                source: 'ticket_priority_command'
            });
        }
    },
};




