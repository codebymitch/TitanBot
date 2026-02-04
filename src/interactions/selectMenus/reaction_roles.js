import { EmbedBuilder } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

/**
 * Handle reaction role select menu interactions
 * @param {import('discord.js').StringSelectMenuInteraction} interaction - The select menu interaction
 * @param {import('discord.js').Client} client - The Discord client
 * @returns {Promise<void>}
 */
export async function execute(interaction, client) {
    try {
        const deferSuccess = await InteractionHelper.safeDefer(interaction, { ephemeral: true });
        if (!deferSuccess) return;

        // Get the reaction role data from database using consistent key format
        const key = `reaction_roles:${interaction.guildId}:${interaction.message.id}`;
        const reactionRoleData = await client.db.get(key);
        
        // Handle database response format
        let actualData;
        if (reactionRoleData && reactionRoleData.ok && reactionRoleData.value) {
            actualData = reactionRoleData.value;
        } else if (reactionRoleData && reactionRoleData.value) {
            actualData = reactionRoleData.value;
        } else {
            actualData = reactionRoleData;
        }
        
        if (!actualData) {
            return interaction.editReply({
                embeds: [
                    new EmbedBuilder()
                        .setDescription('❌ This reaction role message is no longer active.')
                        .setColor('#ED4245')
                ]
            });
        }

        const member = interaction.member;
        const selectedRoleIds = interaction.values;
        
        // Check if bot has permission to manage roles
        if (!interaction.guild.members.me.permissions.has('ManageRoles')) {
            return interaction.editReply({
                embeds: [
                    new EmbedBuilder()
                        .setDescription('❌ I do not have permission to manage roles in this server.')
                        .setColor('#ED4245')
                ]
            });
        }
        
        // Check bot's role hierarchy
        const botRolePosition = interaction.guild.members.me.roles.highest.position;
        
        // Handle both array format (new system) and object format (old system)
        let availableRoleIds;
        if (Array.isArray(actualData.roles)) {
            // New format: roles is an array of role IDs
            availableRoleIds = actualData.roles;
        } else if (typeof actualData.roles === 'object') {
            // Old format: roles is an object mapping emoji to role ID
            availableRoleIds = Object.values(actualData.roles);
        } else {
            availableRoleIds = [];
        }

        // Track changes for response message
        const addedRoles = [];
        const removedRoles = [];

        // Process each selected role
        for (const roleId of selectedRoleIds) {
            if (!availableRoleIds.includes(roleId)) continue;

            const role = interaction.guild.roles.cache.get(roleId);
            if (!role) continue;
            
            // Check bot hierarchy for this role
            if (role.position >= botRolePosition) continue;

            if (!member.roles.cache.has(roleId)) {
                // Add the role
                await member.roles.add(role);
                addedRoles.push(role.name);
            }
        }

        // Process roles that should be removed (not selected but user has them)
        for (const roleId of availableRoleIds) {
            if (selectedRoleIds.includes(roleId)) continue; // Skip if selected

            const role = interaction.guild.roles.cache.get(roleId);
            if (!role) continue;

            // Check bot hierarchy for this role
            if (role.position >= botRolePosition) continue;

            if (member.roles.cache.has(roleId)) {
                // Remove the role
                await member.roles.remove(role);
                removedRoles.push(role.name);
            }
        }

        // Create response message
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

        const responseEmbed = new EmbedBuilder()
            .setDescription(description)
            .setColor('#57F287')
            .setTimestamp();

        await interaction.editReply({ embeds: [responseEmbed] });

    } catch (error) {
        console.error('Error handling reaction role select menu:', error);
        
        const errorEmbed = new EmbedBuilder()
            .setDescription('❌ An error occurred while updating your roles. Please try again.')
            .setColor('#ED4245');

        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ embeds: [errorEmbed], ephemeral: true });
        } else {
            await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        }
    }
}

export default {
    name: 'reaction_roles',
    execute
};
