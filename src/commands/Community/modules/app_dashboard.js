import { getColor, getDefaultApplicationQuestions, botConfig } from '../../../config/bot.js';
import {
    ActionRowBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ChannelSelectMenuBuilder,
    RoleSelectMenuBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
    MessageFlags,
    ComponentType,
    EmbedBuilder,
    LabelBuilder,
    CheckboxBuilder,
    TextDisplayBuilder,
} from 'discord.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { successEmbed } from '../../../utils/embeds.js';
import { logger } from '../../../utils/logger.js';
import { TitanBotError, ErrorTypes, replyUserError } from '../../../utils/errorHandler.js';
import { safeDeferInteraction } from '../../../utils/interactionValidator.js';
import {
    getApplicationSettings,
    saveApplicationSettings,
    getApplicationRoles,
    saveApplicationRoles,
    getApplicationRoleSettings,
    saveApplicationRoleSettings,
    deleteApplicationRoleSettings,
    getApplications,
    deleteApplication,
} from '../../../utils/database.js';
import { getGuildConfig } from '../../../services/config/guildConfig.js';
import { setLogChannel, resolveApplicationLogChannel, resolveLogChannel } from '../../../services/loggingService.js';

async function buildDashboardEmbed(settings, roles, guild, client) {
    const guildConfig = await getGuildConfig(client, guild.id);
    const applicationsChannel = resolveLogChannel(guildConfig, 'applications') || settings.logChannelId;
    const logChannel = applicationsChannel ? `<#${applicationsChannel}>` : '`Not set`';
    const managerRoleList =
        settings.managerRoles?.length > 0
            ? settings.managerRoles.map(id => `<@&${id}>`).join(',')
            : '`None configured`';
    const roleList =
        roles.length > 0
            ? roles.map(r => `<@&${r.roleId}> — ${r.name}`).join('\n')
            : '`No application roles configured`';
    const questionCount = settings.questions?.length ?? 0;
    const firstQ =
        settings.questions?.[0]
            ? `\`${settings.questions[0].length > 55 ? settings.questions[0].substring(0, 55) + '…' : settings.questions[0]}\``
            : '`Not set`';

    return new EmbedBuilder()
        .setTitle('Applications Dashboard')
        .setDescription(`Manage application settings for **${guild.name}**.\nSelect an option below to modify a setting.`)
        .setColor(getColor('info'))
        .addFields(
            { name: 'Application Status', value: settings.enabled ? 'Enabled' : 'Disabled', inline: true },
            { name: 'Log Channel', value: logChannel, inline: true },
            { name: '\u200B', value: '\u200B', inline: true },
            { name: 'Manager Roles', value: managerRoleList, inline: false },
            { name: 'Questions', value: `${questionCount} configured — first: ${firstQ}`, inline: false },
            { name: 'Application Roles', value: roleList, inline: false },
            {
                name: 'Retention',
                value: `Pending: **${settings.pendingApplicationRetentionDays ?? 30}d** · Reviewed: **${settings.reviewedApplicationRetentionDays ?? 14}d**`,
                inline: false,
            },
        )
        .setFooter({ text: 'Dashboard closes after 15 minutes of inactivity' })
        .setTimestamp();
}

function buildSelectMenu(guildId) {
    return new StringSelectMenuBuilder()
        .setCustomId(`app_cfg_${guildId}`)
        .setPlaceholder('Select a setting to configure...')
        .addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel('Log Channel')
                .setDescription('Set the channel where new applications are logged')
                .setValue('log_channel')
                .setEmoji('📢'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Manager Roles')
                .setDescription('Add or remove a role that can manage applications')
                .setValue('manager_role')
                .setEmoji('🛡️'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Edit Questions')
                .setDescription('Customise the questions shown on the application form')
                .setValue('questions')
                .setEmoji('📝'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Add Application Role')
                .setDescription('Add a role that members can apply for')
                .setValue('role_add')
                .setEmoji('➕'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Remove Application Role')
                .setDescription('Remove a role from the applications list')
                .setValue('role_remove')
                .setEmoji('➖'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Retention Period')
                .setDescription('Set how long pending and reviewed applications are kept')
                .setValue('retention')
                .setEmoji('🗑️'),
        );
}

function buildButtonRow(settings, guildId, disabled = false) {
    const systemOn = settings.enabled === true;
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`app_cfg_toggle_${guildId}`)
            .setLabel('Applications')
            .setStyle(systemOn ? ButtonStyle.Success : ButtonStyle.Danger)
            .setDisabled(disabled),
    );
}

async function refreshDashboard(rootInteraction, settings, roles, guildId, client) {
    const selectMenu = buildSelectMenu(guildId);
    await InteractionHelper.safeEditReply(rootInteraction, {
        embeds: [await buildDashboardEmbed(settings, roles, rootInteraction.guild, client)],
        components: [
            buildButtonRow(settings, guildId),
            new ActionRowBuilder().addComponents(selectMenu),
        ],
    }).catch(() => {});
}

export default {
    prefixOnly: false,
    async execute(interaction, config, client, selectedAppName = null) {
        try {
            const guildId = interaction.guild.id;

            await InteractionHelper.safeDefer(interaction, { flags: ['Ephemeral'] });

            const [settings, roles] = await Promise.all([
                getApplicationSettings(client, guildId),
                getApplicationRoles(client, guildId),
            ]);

            const guildConfig = await getGuildConfig(client, guildId);
            const applicationsChannel = resolveLogChannel(guildConfig, 'applications') || settings.logChannelId;

            const isCompletelyUnconfigured = 
                !applicationsChannel && 
                !settings.enabled && 
                (settings.managerRoles?.length ?? 0) === 0 && 
                roles.length === 0;

            if (isCompletelyUnconfigured) {
                throw new TitanBotError(
                    'Applications system not set up',
                    ErrorTypes.CONFIGURATION,
                    'The applications system has not been configured yet. Please run `/app-admin setup` to create your first application.',
                );
            }

            if (roles.length === 0) {
                await showGlobalDashboard(interaction, settings, roles, guildId, client);
                return;
            }

            if (selectedAppName) {
                const selectedRole = roles.find(r => r.name.toLowerCase() === selectedAppName.toLowerCase());
                if (selectedRole) {
                    await showApplicationDashboard(interaction, selectedRole, settings, roles, guildId, client);
                    return;
                }
                
            }

            const defaultRole = roles[0];
            await showApplicationDashboard(interaction, defaultRole, settings, roles, guildId, client);

        } catch (error) {
            if (error instanceof TitanBotError) throw error;
            logger.error('Unexpected error in app_dashboard:', error);
            throw new TitanBotError(
                `Applications dashboard failed: ${error.message}`,
                ErrorTypes.UNKNOWN,
                'Failed to open the applications dashboard.',
            );
        }
    },
};

async function showApplicationSelector(interaction, roles, settings, guildId, client) {
    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(`app_select_${guildId}`)
        .setPlaceholder('Select an application to configure...')
        .addOptions(
            roles.map(role =>
                new StringSelectMenuOptionBuilder()
                    .setLabel(role.name)
                    .setDescription(`Configure the ${role.name} application`)
                    .setValue(role.roleId)
                    .setEmoji('📋'),
            ),
        );

    const embed = new EmbedBuilder()
        .setTitle('Select Application')
        .setDescription('Choose which application role you want to configure.')
        .setColor(getColor('info'));

    await InteractionHelper.safeEditReply(interaction, {
        embeds: [embed],
        components: [new ActionRowBuilder().addComponents(selectMenu)],
    });

    const collector = interaction.channel.createMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        filter: i =>
            i.user.id === interaction.user.id && i.customId === `app_select_${guildId}`,
        time: 600_000,
        max: 1,
    });

    collector.on('collect', async selectInteraction => {
        const deferred = await safeDeferInteraction(selectInteraction);
        if (!deferred) return;
        
        const selectedRoleId = selectInteraction.values[0];
        const selectedRole = roles.find(r => r.roleId === selectedRoleId);

        if (selectedRole) {
            await showApplicationDashboard(interaction, selectedRole, settings, roles, guildId, client);
        }
    });

    collector.on('end', (collected, reason) => {
        if (reason === 'time' && collected.size === 0) {
            replyUserError(interaction, {
                type: ErrorTypes.RATE_LIMIT,
                message: 'No selection was made. The dashboard has closed.',
            }).catch(() => {});
        }
    });
}

async function showGlobalDashboard(interaction, settings, roles, guildId, client) {
    const selectMenu = buildSelectMenu(guildId);

    await InteractionHelper.safeEditReply(interaction, {
        embeds: [await buildDashboardEmbed(settings, roles, interaction.guild, client)],
        components: [
            buildButtonRow(settings, guildId),
            new ActionRowBuilder().addComponents(selectMenu),
        ],
    });

    setupCollectors(interaction, settings, roles, guildId, client, null);
}

async function showApplicationDashboard(rootInteraction, selectedRole, settings, roles, guildId, client) {
    const roleObj = rootInteraction.guild.roles.cache.get(selectedRole.roleId);

    const guildConfig = await getGuildConfig(client, guildId);
    const appSettings = await getApplicationRoleSettings(client, guildId, selectedRole.roleId);
    const questions = appSettings.questions || settings.questions || [];
    const appLogChannelId = resolveApplicationLogChannel(guildConfig, appSettings, settings);
    const isEnabled = selectedRole.enabled !== false; 

    const logChannelDisplay = appLogChannelId 
        ? `<#${appLogChannelId}>` 
        : '`Inherits global log channel`';
    
    const questionsDisplay = questions.length > 0
        ? questions.map((q, i) => `${i + 1}. \`${q.length > 60 ? q.substring(0, 60) + '…' : q}\``).join('\n')
        : '`Inherits global questions`';
    
    const managerRolesDisplay = settings.managerRoles && settings.managerRoles.length > 0
        ? settings.managerRoles.map(id => `<@&${id}>`).join(',')
        : '`None configured`';

    const embed = new EmbedBuilder()
        .setTitle('📋 Application Dashboard')
        .setDescription(`Configuration for **${selectedRole.name}**`)
        .setColor(isEnabled ? getColor('success') : getColor('error'))
        .addFields(
            { 
                name: 'Role', 
                value: roleObj ? roleObj.toString() : `<@&${selectedRole.roleId}>`, 
                inline: true 
            },
            { 
                name: 'Application Status', 
                value: isEnabled ? '✅ **Enabled**' : '❌ **Disabled**', 
                inline: true 
            },
            { name: '\u200B', value: '\u200B', inline: true },
            { 
                name: 'Questions', 
                value: questionsDisplay,
                inline: false 
            },
            { 
                name: 'Log Channel', 
                value: logChannelDisplay,
                inline: true 
            },
            { 
                name: 'Manager Roles',
                value: managerRolesDisplay,
                inline: true 
            },
            { 
                name: 'Retention Period',
                value: `Pending: **${settings.pendingApplicationRetentionDays ?? 30}d** · Reviewed: **${settings.reviewedApplicationRetentionDays ?? 14}d**`,
                inline: false 
            },
        )
        .setFooter({ text: 'Dashboard closes after 10 minutes of inactivity' })
        .setTimestamp();

    const configMenu = buildApplicationSelectMenu(guildId, selectedRole.roleId);

    const controlButtons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`app_toggle_${selectedRole.roleId}`)
            .setLabel(isEnabled ? 'Disable Application' : 'Enable Application')
            .setStyle(isEnabled ? ButtonStyle.Danger : ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId(`app_delete_${selectedRole.roleId}`)
            .setLabel('Delete Application')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('🗑️'),
    );

    const menuRow = new ActionRowBuilder().addComponents(configMenu);

    await InteractionHelper.safeEditReply(rootInteraction, {
        embeds: [embed],
        components: [menuRow, controlButtons],
    });

    setupCollectors(rootInteraction, settings, roles, guildId, client, selectedRole.roleId);
}

function setupCollectors(interaction, settings, roles, guildId, client, selectedRoleId) {
    const customIdPrefix = selectedRoleId ? `app_cfg_${selectedRoleId}` : `app_cfg_${guildId}`;
    
    const collector = interaction.channel.createMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        filter: i =>
            i.user.id === interaction.user.id && 
            (selectedRoleId 
                ? i.customId === customIdPrefix
                : (i.customId === `app_cfg_${guildId}` || i.customId === `app_select_${guildId}`)),
        time: 600_000,
    });

    collector.on('collect', async selectInteraction => {
        const selectedOption = selectInteraction.values[0];
        try {
            
            if (!selectInteraction.isStringSelectMenu()) {
                return;
            }
            switch (selectedOption) {
                case 'log_channel':
                    await handleLogChannel(selectInteraction, interaction, settings, roles, guildId, client, selectedRoleId);
                    break;
                case 'manager_role':
                    await handleManagerRole(selectInteraction, interaction, settings, roles, guildId, client, selectedRoleId);
                    break;
                case 'questions':
                    await handleQuestions(selectInteraction, interaction, settings, roles, guildId, client, selectedRoleId);
                    break;
                case 'role_add':
                    await handleRoleAdd(selectInteraction, interaction, settings, roles, guildId, client);
                    break;
                case 'role_remove':
                    await handleRoleRemove(selectInteraction, interaction, settings, roles, guildId, client);
                    break;
                case 'retention':
                    await handleRetention(selectInteraction, interaction, settings, roles, guildId, client, selectedRoleId);
                    break;
            }
        } catch (error) {
            if (error instanceof TitanBotError) {
                logger.debug(`Applications config validation error: ${error.message}`);
            } else {
                logger.error('Unexpected applications dashboard error:', error);
            }

            const errorMessage =
                error instanceof TitanBotError
                    ? error.userMessage || 'An error occurred while processing your selection.'
                    : 'An unexpected error occurred while updating the configuration.';

            if (!selectInteraction.replied && !selectInteraction.deferred) {
                await safeDeferInteraction(selectInteraction);
            }

            await replyUserError(selectInteraction, {
                type: ErrorTypes.CONFIGURATION,
                message: errorMessage,
            }).catch(() => {});
        }
    });

    collector.on('end', async (collected, reason) => {
        if (reason === 'time') {
            const timeoutEmbed = new EmbedBuilder()
                .setTitle('\u23f0 Dashboard Timed Out')
                .setDescription('This dashboard has been closed due to inactivity. Please run the command again to continue.')
                .setColor(getColor('error'));
                
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [timeoutEmbed],
                components: [],
            }).catch(() => {});
        }
    });

    if (!selectedRoleId) {
        const globalToggleCollector = interaction.channel.createMessageComponentCollector({
            componentType: ComponentType.Button,
            filter: i =>
                i.user.id === interaction.user.id &&
                i.customId === `app_cfg_toggle_${guildId}`,
            time: 600_000,
        });

        globalToggleCollector.on('collect', async toggleInteraction => {
            const deferred = await safeDeferInteraction(toggleInteraction);
            if (!deferred) return;
            
            try {
                const wasEnabled = settings.enabled === true;
                settings.enabled = !wasEnabled;

                await saveApplicationSettings(interaction.client, guildId, settings);

                const updatedSettings = await getApplicationSettings(interaction.client, guildId);
                const updatedRoles = await getApplicationRoles(interaction.client, guildId);
                await showGlobalDashboard(interaction, updatedSettings, updatedRoles, guildId, interaction.client);

                await toggleInteraction.followUp({
                    embeds: [successEmbed(
                        wasEnabled ? '🔴 Applications Disabled' : '🟢 Applications Enabled',
                        `The applications system is now **${wasEnabled ? 'disabled' : 'enabled'}**.\n\n${
                            wasEnabled 
                                ? 'Members will no longer be able to apply for roles.' 
                                : 'Members can now start applying for roles.'
                        }`,
                    )],
                    flags: MessageFlags.Ephemeral,
                });

            } catch (error) {
                logger.error('Error toggling global application status:', error);
                await replyUserError(toggleInteraction, {
                    type: ErrorTypes.UNKNOWN,
                    message: 'An error occurred while toggling the application status.',
                });
            }
        });

        globalToggleCollector.on('end', async (collected, reason) => {
            if (reason === 'time') {
                const timeoutEmbed = new EmbedBuilder()
                    .setTitle('Configuration Timeout')
                    .setDescription('This dashboard session has timed out due to inactivity (10 minutes).\n\nTo continue configuring your applications, please run the command again.')
                    .setColor(getColor('warning'));
                    
                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [timeoutEmbed],
                    components: [],
                }).catch(() => {});
            }
        });
    }

    if (selectedRoleId) {
        const btnCollector = interaction.channel.createMessageComponentCollector({
            componentType: ComponentType.Button,
            filter: i =>
                i.user.id === interaction.user.id &&
                i.customId === `app_delete_${selectedRoleId}`,
            time: 600_000,
        });

        btnCollector.on('collect', async btnInteraction => {
            
            const appRoleForDelete = roles.find(r => r.roleId === selectedRoleId);
            const appNameForDelete = appRoleForDelete?.name ?? 'this application';

            const confirmModal = new ModalBuilder()
                .setCustomId('app_delete_confirm')
                .setTitle('Confirm Application Deletion');

            const deleteWarningText = new TextDisplayBuilder()
                .setContent(`⚠️ You are about to permanently delete **${appNameForDelete}**. All stored applications and settings for this role will be removed and cannot be recovered.`);

            const deleteCheckbox = new CheckboxBuilder()
                .setCustomId('confirm_delete')
                .setDefault(false);

            const deleteCheckboxLabel = new LabelBuilder()
                .setLabel('I confirm — this cannot be undone')
                .setCheckboxComponent(deleteCheckbox);

            confirmModal
                .addTextDisplayComponents(deleteWarningText)
                .addLabelComponents(deleteCheckboxLabel);

            try {
                await btnInteraction.showModal(confirmModal);
            } catch (error) {
                logger.error('Error showing delete confirmation modal:', error);
                await replyUserError(btnInteraction, {
                    type: ErrorTypes.UNKNOWN,
                    message: 'Failed to show confirmation modal. Please try again.',
                }).catch(() => {});
                return;
            }

            try {
                const confirmSubmit = await btnInteraction.awaitModalSubmit({
                    time: 60_000,
                    filter: i =>
                        i.customId === 'app_delete_confirm' && i.user.id === btnInteraction.user.id,
                }).catch(() => null);

                if (!confirmSubmit) {
                    await replyUserError(btnInteraction, {
                        type: ErrorTypes.VALIDATION,
                        message: 'Application deletion was cancelled.',
                    });
                    return;
                }

                const confirmed = confirmSubmit.fields.getCheckbox('confirm_delete');
                if (!confirmed) {
                    await replyUserError(confirmSubmit, { type: ErrorTypes.VALIDATION, message: 'You must tick the confirmation checkbox to delete the application.' });
                    return;
                }

                await handleDeleteApplication(confirmSubmit, selectedRoleId, guildId, roles, client);
                collector.stop();
                btnCollector.stop();

            } catch (error) {
                logger.error('Error confirming application deletion:', error);
                await replyUserError(btnInteraction, {
                    type: ErrorTypes.UNKNOWN,
                    message: 'An error occurred while deleting the application.',
                });
            }
        });

        btnCollector.on('end', async (collected, reason) => {
            if (reason === 'time') {
                const timeoutEmbed = new EmbedBuilder()
                    .setTitle('Configuration Timeout')
                    .setDescription('This dashboard session has timed out due to inactivity (10 minutes).\n\nTo continue configuring your applications, please run the command again.')
                    .setColor(getColor('warning'));
                    
                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [timeoutEmbed],
                    components: [],
                }).catch(() => {});
            }
        });

        const toggleCollector = interaction.channel.createMessageComponentCollector({
            componentType: ComponentType.Button,
            filter: i =>
                i.user.id === interaction.user.id &&
                i.customId === `app_toggle_${selectedRoleId}`,
            time: 900_000,
        });

        toggleCollector.on('collect', async toggleInteraction => {
            const deferred = await safeDeferInteraction(toggleInteraction);
            if (!deferred) return;
            
            try {
                
                const roleIndex = roles.findIndex(r => r.roleId === selectedRoleId);
                if (roleIndex === -1) {
                    await replyUserError(toggleInteraction, {
                        type: ErrorTypes.USER_INPUT,
                        message: 'Application role not found.',
                    });
                    return;
                }

                const wasEnabled = roles[roleIndex].enabled !== false;
                roles[roleIndex].enabled = !wasEnabled;

                await saveApplicationRoles(interaction.client, guildId, roles);

                const updatedRole = roles[roleIndex];
                const updatedSettings = await getApplicationSettings(interaction.client, guildId);
                await showApplicationDashboard(interaction, updatedRole, updatedSettings, roles, guildId, interaction.client);

                await toggleInteraction.followUp({
                    embeds: [successEmbed(
                        wasEnabled ? '🔴 Application Disabled' : '🟢 Application Enabled',
                        `The **${updatedRole.name}** application is now **${wasEnabled ? 'disabled' : 'enabled'}**.\n\n${
                            wasEnabled 
                                ? 'This application will no longer appear in `/apply submit` options.' 
                                : 'This application will now appear in `/apply submit` options.'
                        }`,
                    )],
                    flags: MessageFlags.Ephemeral,
                });

            } catch (error) {
                logger.error('Error toggling application status:', error);
                await replyUserError(toggleInteraction, {
                    type: ErrorTypes.UNKNOWN,
                    message: 'An error occurred while toggling the application status.',
                });
            }
        });

        toggleCollector.on('end', async (collected, reason) => {
            if (reason === 'time') {
                const timeoutEmbed = new EmbedBuilder()
                    .setTitle('Configuration Timeout')
                    .setDescription('This dashboard session has timed out due to inactivity (10 minutes).\n\nTo continue configuring your applications, please run the command again.')
                    .setColor(getColor('warning'));
                    
                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [timeoutEmbed],
                    components: [],
                }).catch(() => {});
            }
        });
    }
}

function buildApplicationSelectMenu(guildId, roleId) {
    return new StringSelectMenuBuilder()
        .setCustomId(`app_cfg_${roleId}`)
        .setPlaceholder('Select a setting to configure...')
        .addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel('Log Channel')
                .setDescription('Set the channel where applications are logged')
                .setValue('log_channel')
                .setEmoji('📢'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Manager Roles')
                .setDescription('Add or remove a role that can manage applications')
                .setValue('manager_role')
                .setEmoji('🛡️'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Edit Questions')
                .setDescription('Customise the questions shown on the application form')
                .setValue('questions')
                .setEmoji('📝'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Retention Period')
                .setDescription('Set how long pending and reviewed applications are kept')
                .setValue('retention')
                .setEmoji('🗑️'),
        );
}

async function handleLogChannel(selectInteraction, rootInteraction, settings, roles, guildId, client, selectedRoleId) {
    let currentChannel = settings.logChannelId;
    if (selectedRoleId) {
        const roleSettings = await getApplicationRoleSettings(client, guildId, selectedRoleId);
        currentChannel = roleSettings.logChannelId || settings.logChannelId;
    }

    const modal = new ModalBuilder()
        .setCustomId(`app_cfg_log_channel_modal_${guildId}_${selectedRoleId || 'global'}`)
        .setTitle('Configure Log Channel');

    const channelSelect = new ChannelSelectMenuBuilder()
        .setCustomId('log_channel')
        .setPlaceholder('Select a text channel...')
        .setMinValues(1)
        .setMaxValues(1)
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(true);

    const channelLabel = new LabelBuilder()
        .setLabel('Log Channel')
        .setDescription('Channel where new applications will be logged')
        .setChannelSelectMenuComponent(channelSelect);

    modal.addLabelComponents(channelLabel);

    await selectInteraction.showModal(modal);

    try {
        const modalSubmission = await selectInteraction.awaitModalSubmit({
            time: 5 * 60 * 1000,
            filter: i => i.user.id === selectInteraction.user.id && i.customId === `app_cfg_log_channel_modal_${guildId}_${selectedRoleId || 'global'}`,
        });

        const channelId = modalSubmission.fields.getField('log_channel').values[0];
        const channel = selectInteraction.guild.channels.cache.get(channelId);

        if (selectedRoleId) {
            const roleSettings = await getApplicationRoleSettings(client, guildId, selectedRoleId);
            roleSettings.logChannelId = channelId;
            await saveApplicationRoleSettings(client, guildId, selectedRoleId, roleSettings);
        } else {
            await setLogChannel(client, guildId, 'applications', channelId);
            settings.logChannelId = channelId;
            await saveApplicationSettings(client, guildId, settings);
        }

        await modalSubmission.reply({
            embeds: [successEmbed('Log Channel Updated', `Application logs will now be sent to ${channel ?? `<#${channelId}>`}.\nYou can also manage this from \`/logging dashboard\`.`)],
            flags: MessageFlags.Ephemeral,
        });

        await refreshDashboard(rootInteraction, settings, roles, guildId, client);
    } catch (error) {
        if (error.code === 'INTERACTION_TIMEOUT') return;
        logger.error('Error in log channel modal:', error);
        await replyUserError(selectInteraction, {
            type: ErrorTypes.UNKNOWN,
            message: 'An error occurred while updating the log channel.',
        });
    }
}

async function handleManagerRole(selectInteraction, rootInteraction, settings, roles, guildId, client) {
    const modal = new ModalBuilder()
        .setCustomId(`app_cfg_manager_role_modal_${guildId}`)
        .setTitle('Configure Manager Roles');

    const roleSelect = new RoleSelectMenuBuilder()
        .setCustomId('manager_roles')
        .setPlaceholder('Select roles to grant manager access...')
        .setMinValues(1)
        .setMaxValues(5)
        .setRequired(true);

    const roleLabel = new LabelBuilder()
        .setLabel('Manager Roles')
        .setDescription('Selected roles will be toggled on/off as manager roles')
        .setRoleSelectMenuComponent(roleSelect);

    modal.addLabelComponents(roleLabel);

    await selectInteraction.showModal(modal);

    try {
        const modalSubmission = await selectInteraction.awaitModalSubmit({
            time: 5 * 60 * 1000,
            filter: i => i.user.id === selectInteraction.user.id && i.customId === `app_cfg_manager_role_modal_${guildId}`,
        });

        const selectedRoleIds = modalSubmission.fields.getField('manager_roles').values;
        const roleSet = new Set(settings.managerRoles ?? []);

        for (const roleId of selectedRoleIds) {
            if (roleSet.has(roleId)) {
                roleSet.delete(roleId);
            } else {
                roleSet.add(roleId);
            }
        }

        settings.managerRoles = Array.from(roleSet);
        await saveApplicationSettings(client, guildId, settings);

        const finalList = settings.managerRoles.length > 0
            ? settings.managerRoles.map(id => `<@&${id}>`).join(',')
            : '`None`';

        await modalSubmission.reply({
            embeds: [successEmbed('Manager Roles Updated', `Current manager roles: ${finalList}`)],
            flags: MessageFlags.Ephemeral,
        });

        await refreshDashboard(rootInteraction, settings, roles, guildId, client);
    } catch (error) {
        if (error.code === 'INTERACTION_TIMEOUT') return;
        logger.error('Error in manager role modal:', error);
        await replyUserError(selectInteraction, {
            type: ErrorTypes.UNKNOWN,
            message: 'An error occurred while updating manager roles.',
        });
    }
}

async function handleQuestions(selectInteraction, rootInteraction, settings, roles, guildId, client, selectedRoleId) {
    let currentQuestions = settings.questions ?? [];
    
    if (selectedRoleId) {
        const roleSettings = await getApplicationRoleSettings(client, guildId, selectedRoleId);
        currentQuestions = roleSettings.questions ?? currentQuestions;
    }

    const modal = new ModalBuilder()
        .setCustomId('app_cfg_questions')
        .setTitle('Edit Application Questions')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('q1')
                    .setLabel('Question 1 (required)')
                    .setStyle(TextInputStyle.Short)
                    .setValue(currentQuestions[0] ?? '')
                    .setMaxLength(100)
                    .setMinLength(1)
                    .setRequired(true),
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('q2')
                    .setLabel('Question 2 (optional)')
                    .setStyle(TextInputStyle.Short)
                    .setValue(currentQuestions[1] ?? '')
                    .setMaxLength(100)
                    .setRequired(false),
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('q3')
                    .setLabel('Question 3 (optional)')
                    .setStyle(TextInputStyle.Short)
                    .setValue(currentQuestions[2] ?? '')
                    .setMaxLength(100)
                    .setRequired(false),
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('q4')
                    .setLabel('Question 4 (optional)')
                    .setStyle(TextInputStyle.Short)
                    .setValue(currentQuestions[3] ?? '')
                    .setMaxLength(100)
                    .setRequired(false),
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('q5')
                    .setLabel('Question 5 (optional)')
                    .setStyle(TextInputStyle.Short)
                    .setValue(currentQuestions[4] ?? '')
                    .setMaxLength(100)
                    .setRequired(false),
            ),
        );

    await selectInteraction.showModal(modal);

    const submitted = await selectInteraction
        .awaitModalSubmit({
            filter: i =>
                i.customId === 'app_cfg_questions' && i.user.id === selectInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!submitted) return;

    const newQuestions = ['q1', 'q2', 'q3', 'q4', 'q5']
        .map(key => submitted.fields.getTextInputValue(key).trim())
        .filter(Boolean);

    if (newQuestions.length === 0) {
        await replyUserError(submitted, { type: ErrorTypes.USER_INPUT, message: 'At least one question is required.' });
        return;
    }

    if (selectedRoleId) {
        
        const roleSettings = await getApplicationRoleSettings(client, guildId, selectedRoleId);
        roleSettings.questions = newQuestions;
        await saveApplicationRoleSettings(client, guildId, selectedRoleId, roleSettings);
    } else {
        
        settings.questions = newQuestions;
        await saveApplicationSettings(client, guildId, settings);
    }

    await submitted.reply({
        embeds: [
            successEmbed(
                '✅ Questions Updated',
                `${newQuestions.length} question${newQuestions.length !== 1 ? 's' : ''} saved.`,
            ),
        ],
        flags: MessageFlags.Ephemeral,
    });

    await refreshDashboard(rootInteraction, settings, roles, guildId, client);
}

async function handleRoleAdd(selectInteraction, rootInteraction, settings, roles, guildId, client) {
    const modal = new ModalBuilder()
        .setCustomId(`app_cfg_role_add_modal_${guildId}`)
        .setTitle('Add Application Role');

    const roleSelect = new RoleSelectMenuBuilder()
        .setCustomId('application_role')
        .setPlaceholder('Select the role members can apply for...')
        .setMinValues(1)
        .setMaxValues(1)
        .setRequired(true);

    const roleLabel = new LabelBuilder()
        .setLabel('Application Role')
        .setDescription('Select the Discord role members will be applying for')
        .setRoleSelectMenuComponent(roleSelect);

    const nameInput = new TextInputBuilder()
        .setCustomId('role_name')
        .setLabel('Display name (leave blank to use role name)')
        .setStyle(TextInputStyle.Short)
        .setMaxLength(50)
        .setRequired(false);

    modal.addLabelComponents(roleLabel);
    modal.addComponents(new ActionRowBuilder().addComponents(nameInput));

    await selectInteraction.showModal(modal);

    try {
        const modalSubmission = await selectInteraction.awaitModalSubmit({
            time: 5 * 60 * 1000,
            filter: i => i.user.id === selectInteraction.user.id && i.customId === `app_cfg_role_add_modal_${guildId}`,
        });

        const roleId = modalSubmission.fields.getField('application_role').values[0];
        const role = selectInteraction.guild.roles.cache.get(roleId);
        const customName = modalSubmission.fields.getTextInputValue('role_name').trim() || role?.name || roleId;

        if (roles.some(r => r.roleId === roleId)) {
            await replyUserError(modalSubmission, { type: ErrorTypes.UNKNOWN, message: `${role ?? roleId} is already an application role.` });
            return;
        }

        roles.push({ roleId, name: customName });
        await saveApplicationRoles(client, guildId, roles);
        await saveApplicationRoleSettings(client, guildId, roleId, {
            questions: getDefaultApplicationQuestions(),
        });

        await modalSubmission.reply({
            embeds: [successEmbed('Role Added', `${role ?? roleId} added as **${customName}**.`)],
            flags: MessageFlags.Ephemeral,
        });

        await refreshDashboard(rootInteraction, settings, roles, guildId, client);
    } catch (error) {
        if (error.code === 'INTERACTION_TIMEOUT') return;
        logger.error('Error in role add modal:', error);
        await replyUserError(selectInteraction, {
            type: ErrorTypes.UNKNOWN,
            message: 'An error occurred while adding the application role.',
        });
    }
}

async function handleRoleRemove(selectInteraction, rootInteraction, settings, roles, guildId, client) {
    if (roles.length === 0) {
        await replyUserError(selectInteraction, {
            type: ErrorTypes.USER_INPUT,
            message: 'There are no application roles configured to remove.',
        });
        return;
    }

    const modal = new ModalBuilder()
        .setCustomId(`app_cfg_role_remove_modal_${guildId}`)
        .setTitle('Remove Application Role');

    const roleSelect = new RoleSelectMenuBuilder()
        .setCustomId('remove_role')
        .setPlaceholder('Select the role to remove...')
        .setMinValues(1)
        .setMaxValues(1)
        .setRequired(true);

    const roleLabel = new LabelBuilder()
        .setLabel('Remove Application Role')
        .setDescription('Select the role to remove from the applications list')
        .setRoleSelectMenuComponent(roleSelect);

    modal.addLabelComponents(roleLabel);

    await selectInteraction.showModal(modal);

    try {
        const modalSubmission = await selectInteraction.awaitModalSubmit({
            time: 5 * 60 * 1000,
            filter: i => i.user.id === selectInteraction.user.id && i.customId === `app_cfg_role_remove_modal_${guildId}`,
        });

        const roleId = modalSubmission.fields.getField('remove_role').values[0];
        const index = roles.findIndex(r => r.roleId === roleId);

        if (index === -1) {
            await replyUserError(modalSubmission, { type: ErrorTypes.USER_INPUT, message: `<@&${roleId}> is not in the application roles list.` });
            return;
        }

        roles.splice(index, 1);
        await saveApplicationRoles(client, guildId, roles);

        await modalSubmission.reply({
            embeds: [successEmbed('Role Removed', `<@&${roleId}> has been removed from the application roles.`)],
            flags: MessageFlags.Ephemeral,
        });

        await refreshDashboard(rootInteraction, settings, roles, guildId, client);
    } catch (error) {
        if (error.code === 'INTERACTION_TIMEOUT') return;
        logger.error('Error in role remove modal:', error);
        await replyUserError(selectInteraction, {
            type: ErrorTypes.UNKNOWN,
            message: 'An error occurred while removing the application role.',
        });
    }
}

async function handleRetention(selectInteraction, rootInteraction, settings, roles, guildId, client) {
    const modal = new ModalBuilder()
        .setCustomId('app_cfg_retention')
        .setTitle('Application Retention Periods');

    const retentionInfo = new TextDisplayBuilder()
        .setContent(
            '**Pending** — how long unanswered/in-progress applications are kept before being automatically removed.\n' +
            '**Reviewed** — how long approved or denied applications are kept.\n' +
            '-# Enter a whole number between 1 and 3650 (max 10 years).',
        );

    const pendingLabel = new LabelBuilder()
        .setLabel('Pending retention (days)')
        .setTextInputComponent(
            new TextInputBuilder()
                .setCustomId('pending_days')
                .setStyle(TextInputStyle.Short)
                .setValue(String(settings.pendingApplicationRetentionDays ?? 30))
                .setMaxLength(4)
                .setMinLength(1)
                .setRequired(true),
        );

    const reviewedLabel = new LabelBuilder()
        .setLabel('Reviewed retention (days)')
        .setTextInputComponent(
            new TextInputBuilder()
                .setCustomId('reviewed_days')
                .setStyle(TextInputStyle.Short)
                .setValue(String(settings.reviewedApplicationRetentionDays ?? 14))
                .setMaxLength(4)
                .setMinLength(1)
                .setRequired(true),
        );

    modal
        .addTextDisplayComponents(retentionInfo)
        .addLabelComponents(pendingLabel, reviewedLabel);

    await selectInteraction.showModal(modal);

    const submitted = await selectInteraction
        .awaitModalSubmit({
            filter: i =>
                i.customId === 'app_cfg_retention' && i.user.id === selectInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!submitted) return;

    const pendingDays = parseInt(submitted.fields.getTextInputValue('pending_days').trim(), 10);
    const reviewedDays = parseInt(submitted.fields.getTextInputValue('reviewed_days').trim(), 10);

    if (isNaN(pendingDays) || pendingDays < 1 || pendingDays > 3650) {
        await replyUserError(submitted, { type: ErrorTypes.VALIDATION, message: 'Pending retention must be a whole number between **1** and **3650** days.' });
        return;
    }

    if (isNaN(reviewedDays) || reviewedDays < 1 || reviewedDays > 3650) {
        await replyUserError(submitted, { type: ErrorTypes.VALIDATION, message: 'Reviewed retention must be a whole number between **1** and **3650** days.' });
        return;
    }

    settings.pendingApplicationRetentionDays = pendingDays;
    settings.reviewedApplicationRetentionDays = reviewedDays;
    await saveApplicationSettings(client, guildId, settings);

    await submitted.reply({
        embeds: [
            successEmbed(
                '✅ Retention Updated',
                `Pending applications will be kept for **${pendingDays} days**.\nReviewed applications will be kept for **${reviewedDays} days**.`,
            ),
        ],
        flags: MessageFlags.Ephemeral,
    });

    await refreshDashboard(rootInteraction, settings, roles, guildId, client);
}

async function handleDeleteApplication(confirmSubmit, selectedRoleId, guildId, roles, client) {
    try {
        
        const roleIndex = roles.findIndex(r => r.roleId === selectedRoleId);
        if (roleIndex === -1) {
            await replyUserError(confirmSubmit, { type: ErrorTypes.USER_INPUT, message: 'Application role not found.' });
            return;
        }

        const deletedRole = roles[roleIndex];

        roles.splice(roleIndex, 1);

        await saveApplicationRoles(client, guildId, roles);

        await deleteApplicationRoleSettings(client, guildId, selectedRoleId);

        const allApplications = await getApplications(client, guildId);
        const applicationsToDelete = allApplications.filter(app => app.roleId === selectedRoleId);

        for (const app of applicationsToDelete) {
            await deleteApplication(client, guildId, app.id, app.userId);
        }

        await confirmSubmit.reply({
            embeds: [
                successEmbed(
                    '🗑️ Application Deleted',
                    `The application for <@&${selectedRoleId}> (**${deletedRole.name}**) has been permanently deleted.\n\n` +
                    `Deleted: **${applicationsToDelete.length}** application${applicationsToDelete.length !== 1 ? 's' : ''}`,
                ),
            ],
            flags: MessageFlags.Ephemeral,
        });

    } catch (error) {
        logger.error('Error in handleDeleteApplication:', error);
        await replyUserError(confirmSubmit, { type: ErrorTypes.UNKNOWN, message: 'An error occurred while deleting the application. Please try again.' });
    }
}