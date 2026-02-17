import { EmbedBuilder, MessageFlags } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { getColor } from '../../config/bot.js';
import { logEvent, EVENT_TYPES } from '../../services/loggingService.js';
import { getReactionRoleMessage } from '../../services/reactionRoleService.js';

/**
 * Handle reaction role select menu interactions
 * @param {import('discord.js').StringSelectMenuInteraction} interaction - The select menu interaction
 * @param {import('discord.js').Client} client - The Discord client
 * @returns {Promise<void>}
 */
export async function execute(interaction, client) {
    try {
        const deferSuccess = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
        if (!deferSuccess) return;

        logger.debug(`Reaction role select menu interaction by ${interaction.user.tag} on message ${interaction.message.id}`);

        // Get reaction role data using service layer
        const reactionRoleData = await getReactionRoleMessage(client, interaction.guildId, interaction.message.id);
        
        if (!reactionRoleData) {
            logger.warn(`Reaction role data not found for message ${interaction.message.id} in guild ${interaction.guildId}`);
            return interaction.editReply({
                embeds: [
                    new EmbedBuilder()
                        .setDescription('❌ This reaction role message is no longer active.')
                        .setColor(getColor('error'))
                ]
            });
        }

        const member = interaction.member;
        const selectedRoleIds = interaction.values;
        
        // Permission checks
        if (!interaction.guild.members.me.permissions.has('ManageRoles')) {
            throw createError(
                'Bot missing ManageRoles permission',
                ErrorTypes.PERMISSION,
                'I do not have permission to manage roles in this server.',
                { guildId: interaction.guildId }
            );
        }
        
        const botRolePosition = interaction.guild.members.me.roles.highest.position;
        
        // Get available role IDs from data
        let availableRoleIds;
        if (Array.isArray(reactionRoleData.roles)) {
            availableRoleIds = reactionRoleData.roles;
        } else if (typeof reactionRoleData.roles === 'object') {
            availableRoleIds = Object.values(reactionRoleData.roles);
        } else {
            availableRoleIds = [];
        }

        const addedRoles = [];
        const removedRoles = [];
        const skippedRoles = [];

        // Add selected roles
        for (const roleId of selectedRoleIds) {
            if (!availableRoleIds.includes(roleId)) {
                logger.warn(`Role ${roleId} not in available roles for message ${interaction.message.id}`);
                continue;
            }

            const role = interaction.guild.roles.cache.get(roleId);
            if (!role) {
                logger.warn(`Role ${roleId} not found in guild ${interaction.guildId}`);
                skippedRoles.push(roleId);
                continue;
            }
            
            // Check role hierarchy
            if (role.position >= botRolePosition) {
                logger.warn(`Cannot assign role ${role.name} (${roleId}), hierarchy issue`);
                skippedRoles.push(role.name);
                continue;
            }

            // Add role if member doesn't have it
            if (!member.roles.cache.has(roleId)) {
                try {
                    await member.roles.add(role);
                    addedRoles.push(role.name);
                    logger.debug(`Added role ${role.name} to ${member.user.tag}`);
                } catch (roleError) {
                    logger.error(`Failed to add role ${role.name} to ${member.user.tag}:`, roleError);
                    skippedRoles.push(role.name);
                }
            }
        }

        // Remove unselected roles
        for (const roleId of availableRoleIds) {
            if (selectedRoleIds.includes(roleId)) continue;

            const role = interaction.guild.roles.cache.get(roleId);
            if (!role) continue;

            // Check role hierarchy
            if (role.position >= botRolePosition) continue;

            // Remove role if member has it
            if (member.roles.cache.has(roleId)) {
                try {
                    await member.roles.remove(role);
                    removedRoles.push(role.name);
                    logger.debug(`Removed role ${role.name} from ${member.user.tag}`);
                } catch (roleError) {
                    logger.error(`Failed to remove role ${role.name} from ${member.user.tag}:`, roleError);
                }
            }
        }

        // Build response message
        let description = '🎭 **Roles updated successfully!**\n\n';
        
        if (addedRoles.length > 0) {
            description += `✅ **Added:** ${addedRoles.map(name => `**${name}**`).join(', ')}\n`;
        }
        
        if (removedRoles.length > 0) {
            description += `❌ **Removed:** ${removedRoles.map(name => `**${name}**`).join(', ')}\n`;
        }
        
        if (addedRoles.length === 0 && removedRoles.length === 0) {
            description += 'No changes were made to your roles.';
        }
        
        if (skippedRoles.length > 0) {
            description += `\n⚠️ **Skipped:** ${skippedRoles.length} role${skippedRoles.length !== 1 ? 's' : ''} (permission issues)`;
        }

        const responseEmbed = new EmbedBuilder()
            .setDescription(description)
            .setColor(getColor('success'))
            .setTimestamp();

        await interaction.editReply({ embeds: [responseEmbed] });
        
        // Log role changes to audit system
        if (addedRoles.length > 0 || removedRoles.length > 0) {
            try {
                await logEvent({
                    client,
                    guildId: interaction.guildId,
                    eventType: EVENT_TYPES.REACTION_ROLE_UPDATE,
                    data: {
                        description: `Reaction roles updated for ${member.user.tag}`,
                        userId: member.user.id,
                        channelId: interaction.channelId,
                        fields: [
                            {
                                name: '👤 Member',
                                value: `${member.user.tag} (${member.user.id})`,
                                inline: false
                            },
                            ...(addedRoles.length > 0 ? [{
                                name: '✅ Roles Added',
                                value: addedRoles.join(', '),
                                inline: false
                            }] : []),
                            ...(removedRoles.length > 0 ? [{
                                name: '❌ Roles Removed',
                                value: removedRoles.join(', '),
                                inline: false
                            }] : [])
                        ]
                    }
                });
            } catch (logError) {
                logger.warn('Failed to log reaction role update:', logError);
            }
        }
        
        logger.info(`Reaction roles updated for ${member.user.tag}: +${addedRoles.length}, -${removedRoles.length}`);

    } catch (error) {
        await handleInteractionError(interaction, error, {
            type: 'select_menu',
            customId: 'reaction_roles'
        });
    }
}

export default {
    name: 'reaction_roles',
    execute
};



