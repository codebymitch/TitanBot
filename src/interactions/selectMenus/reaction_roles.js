import { EmbedBuilder, MessageFlags } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

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

        const key = `reaction_roles:${interaction.guildId}:${interaction.message.id}`;
        const reactionRoleData = await client.db.get(key);
        
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
                        .setDescription('âŒ This reaction role message is no longer active.')
                        .setColor('#ED4245')
                ]
            });
        }

        const member = interaction.member;
        const selectedRoleIds = interaction.values;
        
        if (!interaction.guild.members.me.permissions.has('ManageRoles')) {
            return interaction.editReply({
                embeds: [
                    new EmbedBuilder()
                        .setDescription('âŒ I do not have permission to manage roles in this server.')
                        .setColor('#ED4245')
                ]
            });
        }
        
        const botRolePosition = interaction.guild.members.me.roles.highest.position;
        
        let availableRoleIds;
        if (Array.isArray(actualData.roles)) {
            availableRoleIds = actualData.roles;
        } else if (typeof actualData.roles === 'object') {
            availableRoleIds = Object.values(actualData.roles);
        } else {
            availableRoleIds = [];
        }

        const addedRoles = [];
        const removedRoles = [];

        for (const roleId of selectedRoleIds) {
            if (!availableRoleIds.includes(roleId)) continue;

            const role = interaction.guild.roles.cache.get(roleId);
            if (!role) continue;
            
            if (role.position >= botRolePosition) continue;

            if (!member.roles.cache.has(roleId)) {
                await member.roles.add(role);
                addedRoles.push(role.name);
            }
        }

        for (const roleId of availableRoleIds) {
if (selectedRoleIds.includes(roleId)) continue;

            const role = interaction.guild.roles.cache.get(roleId);
            if (!role) continue;

            if (role.position >= botRolePosition) continue;

            if (member.roles.cache.has(roleId)) {
                await member.roles.remove(role);
                removedRoles.push(role.name);
            }
        }

        let description = 'ðŸŽ­ **Roles updated successfully!**\n\n';
        
        if (addedRoles.length > 0) {
            description += `âœ… **Added:** ${addedRoles.map(name => `**${name}**`).join(', ')}\n`;
        }
        
        if (removedRoles.length > 0) {
            description += `âŒ **Removed:** ${removedRoles.map(name => `**${name}**`).join(', ')}\n`;
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
            .setDescription('âŒ An error occurred while updating your roles. Please try again.')
            .setColor('#ED4245');

        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
        } else {
            await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
        }
    }
}

export default {
    name: 'reaction_roles',
    execute
};

