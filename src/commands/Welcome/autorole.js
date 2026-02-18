import { getColor } from '../../config/bot.js';
import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, EmbedBuilder, MessageFlags } from 'discord.js';
import { getWelcomeConfig, updateWelcomeConfig } from '../../utils/database.js';
import { logger } from '../../utils/logger.js';
import { errorEmbed } from '../../utils/embeds.js';

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
                logger.warn(`[Autorole] User ${interaction.user.tag} tried to add role ${role.name} (${role.id}) higher than bot's highest role in ${guild.name}`);
                return interaction.reply({
                    embeds: [errorEmbed('Role Too High', "I can't assign roles that are higher than my highest role.")],
                    flags: MessageFlags.Ephemeral
                });
            }

            try {
                const config = await getWelcomeConfig(client, guild.id);
                const existingRoles = config.roleIds || [];
                
                
                if (existingRoles.includes(role.id)) {
                    logger.info(`[Autorole] User ${interaction.user.tag} tried to add duplicate role ${role.name} (${role.id}) in ${guild.name}`);
                    return interaction.editReply({
                        embeds: [errorEmbed('Already Added', `The role ${role} is already set to be auto-assigned.`)],
                        flags: MessageFlags.Ephemeral
                    });
                }

                
                const updatedRoles = [...new Set([...existingRoles, role.id])];
                
                await updateWelcomeConfig(client, guild.id, {
                    roleIds: updatedRoles
                });

                logger.info(`[Autorole] Added role ${role.name} (${role.id}) to auto-assign in ${guild.name} by ${interaction.user.tag}`);
                await interaction.editReply({
                    content: `✅ Added ${role} to auto-assigned roles.`,
                    flags: MessageFlags.Ephemeral
                });
            } catch (error) {
                logger.error(`[Autorole] Failed to add role for guild ${guild.id}:`, error);
                await interaction.editReply({
                    embeds: [errorEmbed(
                        'Add Failed',
                        'An error occurred while adding the role. Please try again.',
                        { showDetails: true }
                    )],
                    flags: MessageFlags.Ephemeral
                });
            }
        } 
        
        else if (subcommand === 'remove') {
            const role = options.getRole('role');

            try {
                const config = await getWelcomeConfig(client, guild.id);
                const existingRoles = config.roleIds || [];
                
                if (!existingRoles.includes(role.id)) {
                    logger.info(`[Autorole] User ${interaction.user.tag} tried to remove non-existent role ${role.name} (${role.id}) in ${guild.name}`);
                    return interaction.editReply({
                        embeds: [errorEmbed('Not Found', `The role ${role} is not set to be auto-assigned.`)],
                        flags: MessageFlags.Ephemeral
                    });
                }

                const updatedRoles = existingRoles.filter(id => id !== role.id);
                
                await updateWelcomeConfig(client, guild.id, {
                    roleIds: updatedRoles
                });

                logger.info(`[Autorole] Removed role ${role.name} (${role.id}) from auto-assign in ${guild.name} by ${interaction.user.tag}`);
                await interaction.editReply({
                    content: `✅ Removed ${role} from auto-assigned roles.`,
                    flags: MessageFlags.Ephemeral
                });
            } catch (error) {
                logger.error(`[Autorole] Failed to remove role for guild ${guild.id}:`, error);
                await interaction.editReply({
                    embeds: [errorEmbed(
                        'Remove Failed',
                        'An error occurred while removing the role. Please try again.',
                        { showDetails: true }
                    )],
                    flags: MessageFlags.Ephemeral
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
                        flags: MessageFlags.Ephemeral
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
                    logger.info(`[Autorole] Cleaning up ${invalidRoleIds.length} invalid role(s) from guild ${interaction.guild.name}`);
                    const updatedRoles = autoRoles.filter(id => !invalidRoleIds.includes(id));
                    await updateWelcomeConfig(client, guild.id, {
                        roleIds: updatedRoles
                    });
                }

                if (validRoles.length === 0) {
                    return interaction.editReply({
                        content: 'ℹ️ No valid auto-assigned roles found. Any invalid roles have been removed.',
                        flags: MessageFlags.Ephemeral
                    });
                }

                const embed = new EmbedBuilder()
                    .setColor(getColor('info'))
                    .setTitle('Auto-Assigned Roles')
                    .setDescription(validRoles.map(r => `• ${r}`).join('\n'))
                    .setFooter({ text: `Total: ${validRoles.length} role(s)` });

                await interaction.editReply({
                    embeds: [embed],
                    flags: MessageFlags.Ephemeral
                });

            } catch (error) {
                logger.error(`[Autorole] Failed to list roles for guild ${guild.id}:`, error);
                await interaction.editReply({
                    embeds: [errorEmbed(
                        'List Failed',
                        'An error occurred while listing auto-assigned roles. Please try again.',
                        { showDetails: true }
                    )],
                    flags: MessageFlags.Ephemeral
                });
            }
        }
    },
};



