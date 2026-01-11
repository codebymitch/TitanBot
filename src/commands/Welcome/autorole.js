import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';

// Migrated from: commands/Welcome/autorole.js
export default {
    data: new SlashCommandBuilder()
        .setName('autorole')
        .setDescription('Manage roles that are automatically assigned to new members')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(subcommand =>
            subcommand
                .setName('add')
                .setDescription('Add a role to be automatically assigned to new members')
                .addRoleOption(option =>
                    option.setName('role')
                        .setDescription('The role to add')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('Remove a role from auto-assignment')
                .addRoleOption(option =>
                    option.setName('role')
                        .setDescription('The role to remove')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('List all auto-assigned roles')),

    async execute(interaction) {
        const { options, guild, client } = interaction;
        const subcommand = options.getSubcommand();

        if (subcommand === 'add') {
            const role = options.getRole('role');
            
            // Check if the bot can manage the role
            if (role.position >= guild.members.me.roles.highest.position) {
                return interaction.reply({
                    content: "❌ I can't assign roles that are higher than my highest role.",
                    ephemeral: true
                });
            }

            try {
                const config = await getWelcomeConfig(client, guild.id);
                const autoRoles = new Set(config.autoRoles || []);
                
                if (autoRoles.has(role.id)) {
                    return interaction.reply({
                        content: `❌ The role ${role} is already set to be auto-assigned.`,
                        ephemeral: true
                    });
                }

                // Add the role to auto-assign
                autoRoles.add(role.id);
                
                // Update the configuration
                await updateWelcomeConfig(client, guild.id, {
                    autoRoles: Array.from(autoRoles)
                });

                await interaction.reply({
                    content: `✅ Added ${role} to auto-assigned roles.`,
                    ephemeral: true
                });
            } catch (error) {
                console.error('Error adding auto-role:', error);
                await interaction.reply({
                    content: '❌ An error occurred while adding the role.',
                    ephemeral: true
                });
            }
        } 
        
        else if (subcommand === 'remove') {
            const role = options.getRole('role');

            try {
                const config = await getWelcomeConfig(client, guild.id);
                const autoRoles = new Set(config.autoRoles || []);
                
                if (!autoRoles.has(role.id)) {
                    return interaction.reply({
                        content: `❌ The role ${role} is not set to be auto-assigned.`,
                        ephemeral: true
                    });
                }

                // Remove the role from auto-assign
                autoRoles.delete(role.id);
                
                // Update the configuration
                await updateWelcomeConfig(client, guild.id, {
                    autoRoles: Array.from(autoRoles)
                });

                await interaction.reply({
                    content: `✅ Removed ${role} from auto-assigned roles.`,
                    ephemeral: true
                });
            } catch (error) {
                console.error('Error removing auto-role:', error);
                await interaction.reply({
                    content: '❌ An error occurred while removing the role.',
                    ephemeral: true
                });
            }
        }
        
        else if (subcommand === 'list') {
            try {
                const config = await getWelcomeConfig(client, guild.id);
                const autoRoles = Array.isArray(config.autoRoles) ? config.autoRoles : [];

                if (autoRoles.length === 0) {
                    return interaction.reply({
                        content: 'ℹ️ No roles are set to be auto-assigned.',
                        ephemeral: true
                    });
                }

                // Fetch all roles at once for better performance
                const roles = await guild.roles.fetch();
                const validRoles = [];
                const invalidRoleIds = [];
                
                // Check each role to see if it still exists
                for (const roleId of autoRoles) {
                    const role = roles.get(roleId);
                    if (role) {
                        validRoles.push(role);
                    } else {
                        invalidRoleIds.push(roleId);
                    }
                }

                // Clean up any invalid roles
                if (invalidRoleIds.length > 0) {
                    const updatedRoles = autoRoles.filter(id => !invalidRoleIds.includes(id));
                    await updateWelcomeConfig(client, guild.id, {
                        autoRoles: updatedRoles
                    });
                }

                if (validRoles.length === 0) {
                    return interaction.reply({
                        content: 'ℹ️ No valid auto-assigned roles found. Any invalid roles have been removed.',
                        ephemeral: true
                    });
                }

                // Create an embed with the list of roles
                const embed = new EmbedBuilder()
                    .setColor(client.config.embeds.colors.primary)
                    .setTitle('Auto-Assigned Roles')
                    .setDescription(validRoles.map(r => `• ${r}`).join('\n'))
                    .setFooter({ text: `Total: ${validRoles.length} role(s)` });

                await interaction.reply({
                    embeds: [embed],
                    ephemeral: true
                });

            } catch (error) {
                console.error('Error listing auto-roles:', error);
                await interaction.reply({
                    content: '❌ An error occurred while listing auto-assigned roles.',
                    ephemeral: true
                });
            }
        }
    },
};
