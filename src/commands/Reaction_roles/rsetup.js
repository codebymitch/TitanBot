import { getColor } from '../../config/bot.js';
import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType, ActionRowBuilder, StringSelectMenuBuilder, EmbedBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { createReactionRoleMessage, hasDangerousPermissions } from '../../services/reactionRoleService.js';
import { logEvent, EVENT_TYPES } from '../../services/loggingService.js';

export default {
    data: new SlashCommandBuilder()
        .setName('rsetup')
        .setDescription('Set up a reaction role message')
        .addChannelOption(option => 
            option.setName('channel')
                .setDescription('The channel to send the reaction role message to')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('title')
                .setDescription('Title for the reaction role message')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('description')
                .setDescription('Description for the reaction role message')
                .setRequired(true)
        )
        .addRoleOption(option =>
            option.setName('role1')
                .setDescription('First role to add')
                .setRequired(true)
        )
        .addRoleOption(option =>
            option.setName('role2')
                .setDescription('Second role to add')
                .setRequired(false)
        )
        .addRoleOption(option =>
            option.setName('role3')
                .setDescription('Third role to add')
                .setRequired(false)
        )
        .addRoleOption(option =>
            option.setName('role4')
                .setDescription('Fourth role to add')
                .setRequired(false)
        )
        .addRoleOption(option =>
            option.setName('role5')
                .setDescription('Fifth role to add')
                .setRequired(false)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        try {
            
            const deferSuccess = await InteractionHelper.safeDefer(interaction);
            if (!deferSuccess) return;
            
            logger.info(`Reaction role setup initiated by ${interaction.user.tag} in guild ${interaction.guild.name}`);
            
            const channel = interaction.options.getChannel('channel');
            const title = interaction.options.getString('title');
            const description = interaction.options.getString('description');
            
            
            if (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement) {
                throw createError(
                    `Invalid channel type: ${channel.type}`,
                    ErrorTypes.VALIDATION,
                    'Please select a text or announcement channel.',
                    { channelType: channel.type }
                );
            }
            
            
            if (!interaction.guild.members.me.permissions.has(PermissionFlagsBits.ManageRoles)) {
                throw createError(
                    'Bot missing ManageRoles permission',
                    ErrorTypes.PERMISSION,
                    'I need the "Manage Roles" permission to set up reaction roles.',
                    { permission: 'ManageRoles' }
                );
            }
            
            
            if (!channel.permissionsFor(interaction.guild.members.me).has(PermissionFlagsBits.SendMessages)) {
                throw createError(
                    `Bot cannot send messages in ${channel.name}`,
                    ErrorTypes.PERMISSION,
                    `I don't have permission to send messages in ${channel}.`,
                    { channelId: channel.id }
                );
            }
            
            
            const roles = [];
            const roleValidationErrors = [];
            
            for (let i = 1; i <= 5; i++) {
                const role = interaction.options.getRole(`role${i}`);
                if (role) {
                    
                    if (role.position >= interaction.guild.members.me.roles.highest.position) {
                        roleValidationErrors.push(`**${role.name}** - My role is not high enough in the hierarchy`);
                        continue;
                    }
                    
                    
                    if (hasDangerousPermissions(role)) {
                        roleValidationErrors.push(`**${role.name}** - This role has dangerous permissions (Administrator, Manage Server, etc.)`);
                        continue;
                    }
                    
                    
                    if (role.managed) {
                        roleValidationErrors.push(`**${role.name}** - This is a managed role (integration/bot role)`);
                        continue;
                    }
                    
                    
                    if (role.id === interaction.guild.id) {
                        roleValidationErrors.push(`**${role.name}** - Cannot use the @everyone role`);
                        continue;
                    }
                    
                    roles.push(role);
                }
            }
            
            
            if (roleValidationErrors.length > 0) {
                const errorMsg = `The following roles cannot be added:\n${roleValidationErrors.join('\n')}`;
                
                if (roles.length === 0) {
                    throw createError(
                        'No valid roles provided',
                        ErrorTypes.VALIDATION,
                        errorMsg,
                        { errors: roleValidationErrors }
                    );
                }
                
                
                await interaction.followUp({
                    embeds: [warningEmbed('Role Validation Warning', errorMsg)],
                    ephemeral: true
                });
            }

            if (roles.length < 1) {
                throw createError(
                    'No roles provided',
                    ErrorTypes.VALIDATION,
                    'You must provide at least one valid role.',
                    {}
                );
            }

            
            const row = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('reaction_roles')
                    .setPlaceholder('Select your roles')
                    .setMinValues(0)
                    .setMaxValues(roles.length)
                    .addOptions(
                        roles.map(role => ({
                            label: role.name,
                            description: `Add/remove the ${role.name} role`,
                            value: role.id,
                            emoji: '🎭'
                        }))
                    )
            );

            
            const message = await channel.send({
                embeds: [{
                    title,
                    description,
                    color: getColor('info'),
                    fields: [
                        {
                            name: 'Available Roles',
                            value: roles.map(role => `• ${role}`).join('\n')
                        }
                    ],
                    footer: {
                        text: 'Select roles from the dropdown menu below'
                    }
                }],
                components: [row]
            });

            
            const roleIds = roles.map(role => role.id);
            await createReactionRoleMessage(
                interaction.client,
                interaction.guildId,
                channel.id,
                message.id,
                roleIds
            );
            
            logger.info(`Reaction role message created: ${message.id} with ${roles.length} roles by ${interaction.user.tag}`);

            
            try {
                await logEvent({
                    client: interaction.client,
                    guildId: interaction.guildId,
                    eventType: EVENT_TYPES.REACTION_ROLE_CREATE,
                    data: {
                        description: `Reaction role message created by ${interaction.user.tag}`,
                        userId: interaction.user.id,
                        channelId: channel.id,
                        fields: [
                            {
                                name: '📝 Title',
                                value: title,
                                inline: false
                            },
                            {
                                name: '📍 Channel',
                                value: channel.toString(),
                                inline: true
                            },
                            {
                                name: '📊 Roles',
                                value: `${roles.length} roles`,
                                inline: true
                            },
                            {
                                name: '🏷️ Role List',
                                value: roles.map(r => r.toString()).join(', '),
                                inline: false
                            },
                            {
                                name: '🔗 Message Link',
                                value: message.url,
                                inline: false
                            }
                        ]
                    }
                });
            } catch (logError) {
                logger.warn('Failed to log reaction role creation:', logError);
            }

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [successEmbed('Success', `✅ Reaction role message created in ${channel}!\n\n${message.url}`)]
            });

        } catch (error) {
            await handleInteractionError(interaction, error, {
                type: 'command',
                commandName: 'rsetup'
            });
        }
    }
};



