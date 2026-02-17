import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { deleteReactionRoleMessage, getReactionRoleMessage } from '../../services/reactionRoleService.js';
import { logEvent, EVENT_TYPES } from '../../services/loggingService.js';

export default {
    data: new SlashCommandBuilder()
        .setName('rdelete')
        .setDescription('Delete a reaction role message')
        .addStringOption(option =>
            option.setName('message_id')
                .setDescription('The ID of the reaction role message to delete')
                .setRequired(true)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        try {
            // Defer the interaction
            const deferSuccess = await InteractionHelper.safeDefer(interaction);
            if (!deferSuccess) return;
            
            const messageId = interaction.options.getString('message_id');
            
            logger.info(`Reaction role deletion requested by ${interaction.user.tag} for message ${messageId} in guild ${interaction.guild.name}`);
            
            // Validate message ID format
            if (!/^\d{17,19}$/.test(messageId)) {
                throw createError(
                    `Invalid message ID format: ${messageId}`,
                    ErrorTypes.VALIDATION,
                    'Please provide a valid message ID (17-19 digits).',
                    { messageId }
                );
            }
            
            // Get the reaction role data before deleting
            const reactionRoleData = await getReactionRoleMessage(interaction.client, interaction.guildId, messageId);
            
            if (!reactionRoleData) {
                throw createError(
                    `Reaction role message not found: ${messageId}`,
                    ErrorTypes.CONFIGURATION,
                    'No reaction role message found with that ID in this server.',
                    { messageId, guildId: interaction.guildId }
                );
            }

            // Try to delete the actual Discord message
            let messageDeleted = false;
            try {
                const channel = await interaction.guild.channels.fetch(reactionRoleData.channelId).catch(() => null);
                
                if (channel) {
                    const message = await channel.messages.fetch(messageId).catch(() => null);
                    if (message) {
                        await message.delete();
                        messageDeleted = true;
                        logger.info(`Deleted reaction role Discord message ${messageId} from channel ${channel.name}`);
                    } else {
                        logger.warn(`Discord message ${messageId} not found in channel ${channel.name}, will only remove from database`);
                    }
                } else {
                    logger.warn(`Channel ${reactionRoleData.channelId} not found, will only remove from database`);
                }
            } catch (deleteError) {
                logger.warn(`Failed to delete Discord message ${messageId}:`, deleteError);
                // Continue to delete from database even if Discord message deletion fails
            }

            // Delete from database using service layer
            await deleteReactionRoleMessage(interaction.client, interaction.guildId, messageId);
            
            logger.info(`Reaction role message ${messageId} deleted from database by ${interaction.user.tag}`);
            
            // Log to audit system
            try {
                await logEvent({
                    client: interaction.client,
                    guildId: interaction.guildId,
                    eventType: EVENT_TYPES.REACTION_ROLE_DELETE,
                    data: {
                        description: `Reaction role message deleted by ${interaction.user.tag}`,
                        userId: interaction.user.id,
                        fields: [
                            {
                                name: '🗑️ Message ID',
                                value: messageId,
                                inline: true
                            },
                            {
                                name: '📍 Channel',
                                value: `<#${reactionRoleData.channelId}>`,
                                inline: true
                            },
                            {
                                name: '📊 Status',
                                value: messageDeleted ? '✅ Message deleted' : '⚠️ Database only',
                                inline: true
                            },
                            {
                                name: '🏷️ Roles',
                                value: `${Array.isArray(reactionRoleData.roles) ? reactionRoleData.roles.length : Object.keys(reactionRoleData.roles || {}).length} roles removed`,
                                inline: false
                            }
                        ]
                    }
                });
            } catch (logError) {
                logger.warn('Failed to log reaction role deletion:', logError);
            }

            // Send success message
            const responseMessage = messageDeleted 
                ? '✅ Reaction role message has been deleted from both Discord and the database.'
                : '✅ Reaction role message has been deleted from the database.\n⚠️ The Discord message could not be found or deleted.';
            
            await interaction.editReply({
                embeds: [successEmbed('Success', responseMessage)]
            });

        } catch (error) {
            await handleInteractionError(interaction, error, {
                type: 'command',
                commandName: 'rdelete'
            });
        }
    }
};


