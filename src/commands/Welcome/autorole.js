import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType, EmbedBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';
import { getWelcomeConfig, updateWelcomeConfig } from '../../utils/database.js';

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
            
            if (role.position >= guild.members.me.roles.highest.position) {
                return interaction.reply({
                    content: "❌ I can't assign roles that are higher than my highest role.",
                    flags: ["Ephemeral"]
                });
            }

            try {
                const config = await getWelcomeConfig(client, guild.id);
                const autoRoles = new Set(config.roleIds || []);
                
                if (autoRoles.has(role.id)) {
                    return interaction.editReply({
                        content: `❌ The role ${role} is already set to be auto-assigned.`,
                        flags: ["Ephemeral"]
                    });
                }

                autoRoles.add(role.id);
                
                await updateWelcomeConfig(client, guild.id, {
                    roleIds: Array.from(autoRoles)
                });

                await interaction.editReply({
                    content: `✅ Added ${role} to auto-assigned roles.`,
                    flags: ["Ephemeral"]
                });
            } catch (error) {
                await interaction.editReply({
                    content: '❌ An error occurred while adding the role.',
                    flags: ["Ephemeral"]
                });
            }
        } 
        
        else if (subcommand === 'remove') {
            const role = options.getRole('role');

            try {
                const config = await getWelcomeConfig(client, guild.id);
                const autoRoles = new Set(config.roleIds || []);
                
                if (!autoRoles.has(role.id)) {
                    return interaction.editReply({
                        content: `❌ The role ${role} is not set to be auto-assigned.`,
                        flags: ["Ephemeral"]
                    });
                }

                autoRoles.delete(role.id);
                
                await updateWelcomeConfig(client, guild.id, {
                    roleIds: Array.from(autoRoles)
                });

                await interaction.editReply({
                    content: `✅ Removed ${role} from auto-assigned roles.`,
                    flags: ["Ephemeral"]
                });
            } catch (error) {
                await interaction.editReply({
                    content: '❌ An error occurred while removing the role.',
                    flags: ["Ephemeral"]
                });
            }
        }
        
        else if (subcommand === 'list') {
            try {
                const config = await getWelcomeConfig(client, guild.id);
                const autoRoles = Array.isArray(config.roleIds) ? config.roleIds : [];

                if (autoRoles.length === 0) {
                    return interaction.editReply({
                        content: 'ℹ️ No roles are set to be auto-assigned.',
                        flags: ["Ephemeral"]
                    });
                }

                const roles = await guild.roles.fetch();
                const validRoles = [];
                const invalidRoleIds = [];
                
                for (const roleId of autoRoles) {
                    const role = roles.get(roleId);
                    if (role) {
                        validRoles.push(role);
                    } else {
                        invalidRoleIds.push(roleId);
                    }
                }

                if (invalidRoleIds.length > 0) {
                    const updatedRoles = autoRoles.filter(id => !invalidRoleIds.includes(id));
                    await updateWelcomeConfig(client, guild.id, {
                        roleIds: updatedRoles
                    });
                }

                if (validRoles.length === 0) {
                    return interaction.editReply({
                        content: 'ℹ️ No valid auto-assigned roles found. Any invalid roles have been removed.',
                        flags: ["Ephemeral"]
                    });
                }

                const embed = new EmbedBuilder()
.setColor(0x0099ff)
                    .setTitle('Auto-Assigned Roles')
                    .setDescription(validRoles.map(r => `• ${r}`).join('\n'))
                    .setFooter({ text: `Total: ${validRoles.length} role(s)` });

                await interaction.editReply({
                    embeds: [embed],
                    flags: ["Ephemeral"]
                });

            } catch (error) {
                await interaction.editReply({
                    content: '❌ An error occurred while listing auto-assigned roles.',
                    flags: ["Ephemeral"]
                });
            }
        }
    },
};
