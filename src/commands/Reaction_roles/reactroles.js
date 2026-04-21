import { getColor } from '../../config/bot.js';
import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, RoleSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ButtonBuilder, ButtonStyle, MessageFlags, ComponentType, EmbedBuilder, LabelBuilder, CheckboxBuilder, TextDisplayBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError, createError, TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { createReactionRoleMessage, hasDangerousPermissions, getAllReactionRoleMessages, deleteReactionRoleMessage } from '../../services/reactionRoleService.js';
import { logEvent, EVENT_TYPES } from '../../services/loggingService.js';

export default {
    data: new SlashCommandBuilder()
        .setName('reactroles')
        .setDescription('Manage reaction role assignments')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(subcommand =>
            subcommand
                .setName('setup')
                .setDescription('Set up a new reaction role panel')
                .addChannelOption(option => 
                    option.setName('channel')
                        .setDescription('The channel to send the reaction role message to')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option.setName('title')
                        .setDescription('Title for the reaction role panel')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option.setName('description')
                        .setDescription('Description for the reaction role panel')
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
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('dashboard')
                .setDescription('Manage and configure your reaction role panels')
                .addStringOption(option =>
                    option
                        .setName('panel')
                        .setDescription('Select a reaction role panel to manage')
                        .setRequired(false)
                        .setAutocomplete(true)
                )
        ),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        try {
            if (subcommand === 'setup') {
                await handleSetup(interaction);
            } else if (subcommand === 'dashboard') {
                const selectedPanelId = interaction.options.getString('panel');
                await handleDashboard(interaction, selectedPanelId);
            }
        } catch (error) {
            await handleInteractionError(interaction, error, {
                type: 'command',
                commandName: 'reactroles',
                subcommand: subcommand
            });
        }
    },

    async autocomplete(interaction) {
        if (interaction.commandName !== 'reactroles') return;
        if (interaction.options.getSubcommand() !== 'dashboard') return;

        try {
            const guildId = interaction.guild.id;
            const client = interaction.client;
            
            let panels;
            try {
                panels = await getAllReactionRoleMessages(client, guildId);
            } catch (dbError) {
                // If database query fails, just respond with empty
                await interaction.respond([]).catch(() => {});
                return;
            }

            if (!panels || panels.length === 0) {
                await interaction.respond([]).catch(() => {});
                return;
            }

            const guild = interaction.guild;
            
            // Filter out panels whose messages no longer exist and clean up stale data
            const validPanels = [];
            for (const panel of panels) {
                // Validate panel structure
                if (!panel.messageId || !panel.channelId) {
                    continue;
                }

                const channel = guild.channels.cache.get(panel.channelId);
                if (!channel) {
                    await deleteReactionRoleMessage(client, guildId, panel.messageId).catch(() => {});
                    continue;
                }
                
                const msg = await channel.messages.fetch(panel.messageId).catch(() => null);
                if (!msg) {
                    await deleteReactionRoleMessage(client, guildId, panel.messageId).catch(() => {});
                    continue;
                }
                validPanels.push(panel);
            }

            if (validPanels.length === 0) {
                await interaction.respond([]).catch(() => {});
                return;
            }

            const choices = await Promise.all(
                validPanels.slice(0, 25).map(async panel => {
                    try {
                        const channel = guild.channels.cache.get(panel.channelId);
                        if (!channel) return null;
                        
                        const msg = await channel.messages.fetch(panel.messageId).catch(() => null);
                        if (!msg) return null;
                        
                        const title = msg?.embeds?.[0]?.title ?? 'Untitled Panel';
                        const channelName = channel?.name ?? 'unknown';
                        
                        return {
                            name: `${title} (${channelName})`.substring(0, 100),
                            value: panel.messageId
                        };
                    } catch (e) {
                        return null;
                    }
                })
            );

            const validChoices = choices.filter(c => c !== null);
            await interaction.respond(validChoices).catch(() => {});
        } catch (error) {
            await interaction.respond([]).catch(() => {});
        }
    }
};

// ─── Setup Subcommand ─────────────────────────────────────────────────────────

async function handleSetup(interaction) {
    const deferSuccess = await InteractionHelper.safeDefer(interaction);
    if (!deferSuccess) return;
    
    logger.info(`Reaction role setup initiated by ${interaction.user.tag} in guild ${interaction.guild.name}`);
    
    const channel = interaction.options.getChannel('channel');
    const title = interaction.options.getString('title');
    const description = interaction.options.getString('description');
    
    // Validate channel type
    if (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement) {
        throw createError(
            `Invalid channel type: ${channel.type}`,
            ErrorTypes.VALIDATION,
            'Please select a text or announcement channel.',
            { channelType: channel.type }
        );
    }
    
    // Check bot permissions
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

    // Check if guild has reached max of 5 panels
    const existingPanels = await getAllReactionRoleMessages(interaction.client, interaction.guildId);
    if (existingPanels && existingPanels.length >= 5) {
        throw createError(
            'Panel limit reached',
            ErrorTypes.VALIDATION,
            'Your guild has reached the maximum of 5 reaction role panels. Delete an existing panel to create a new one.',
            { maxPanels: 5, currentPanels: existingPanels.length }
        );
    }
    
    // Collect and validate roles
    const roles = [];
    const roleValidationErrors = [];
    
    for (let i = 1; i <= 5; i++) {
        const role = interaction.options.getRole(`role${i}`);
        if (role) {
            if (role.position >= interaction.guild.members.me.roles.highest.position) {
                roleValidationErrors.push(`**${role.name}** - My bot's role is positioned lower than this role in your server's role hierarchy and cannot assign it`);
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

    // Create the reaction role message
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

    const panelEmbed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(description)
        .setColor(getColor('info'))
        .addFields({
            name: 'Available Roles',
            value: roles.map(role => `• ${role}`).join('\n')
        })
        .setFooter({ text: 'Select roles from the dropdown menu below' });

    const message = await channel.send({
        embeds: [panelEmbed],
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
                description: `Reaction role panel created by ${interaction.user.tag}`,
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
        embeds: [successEmbed('Success', `✅ Reaction role panel created in ${channel}!\n\n${message.url}`)]
    });
}

// ─── Dashboard Subcommand ─────────────────────────────────────────────────────

async function handleDashboard(interaction, selectedPanelId) {
    const deferSuccess = await InteractionHelper.safeDefer(interaction, { flags: ['Ephemeral'] });
    if (!deferSuccess) return;

    const guildId = interaction.guild.id;
    const guild = interaction.guild;
    const client = interaction.client;

    let panels = await getAllReactionRoleMessages(client, guildId);

    if (!panels || panels.length === 0) {
        return await InteractionHelper.safeEditReply(interaction, {
            embeds: [
                errorEmbed(
                    'No Panels Found',
                    'No reaction role panels exist yet. Use `/reactroles setup` to create one.',
                ),
            ],
        });
    }

    // Filter out panels whose messages no longer exist
    const validPanels = [];
    for (const panel of panels) {
        const channel = guild.channels.cache.get(panel.channelId);
        if (!channel) {
            await deleteReactionRoleMessage(client, guildId, panel.messageId).catch(() => {});
            continue;
        }
        
        const msg = await channel.messages.fetch(panel.messageId).catch(() => null);
        if (!msg) {
            await deleteReactionRoleMessage(client, guildId, panel.messageId).catch(() => {});
            continue;
        }
        validPanels.push(panel);
    }

    if (validPanels.length === 0) {
        return await InteractionHelper.safeEditReply(interaction, {
            embeds: [
                errorEmbed(
                    'No Valid Panels Found',
                    'No reaction role panels exist yet. Use `/reactroles setup` to create one.',
                ),
            ],
        });
    }

    // If a panel was selected, use it. Otherwise, pick a random one.
    let activePanelData = null;
    if (selectedPanelId) {
        activePanelData = validPanels.find(p => p.messageId === selectedPanelId);
        if (!activePanelData) {
            return await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    errorEmbed(
                        'Panel Not Found',
                        'That panel no longer exists or has been deleted.',
                    ),
                ],
            });
        }
    } else {
        // Pick a random panel from valid panels
        activePanelData = validPanels[Math.floor(Math.random() * validPanels.length)];
    }

    const discordMsg = await fetchPanelDiscordMessage(guild, activePanelData);
    await showPanelDashboard(interaction, activePanelData, discordMsg, guildId, guild);

    let rootInteraction = interaction;
    const collector = interaction.channel.createMessageComponentCollector({
        filter: i =>
            i.user.id === interaction.user.id &&
            (i.customId === `rr_opts_${guildId}`),
        time: 600_000,
    });

    const buttonCollector = interaction.channel.createMessageComponentCollector({
        componentType: ComponentType.Button,
        filter: i =>
            i.user.id === interaction.user.id &&
            (i.customId === `rr_edit_text_${guildId}` ||
                i.customId === `rr_delete_${guildId}`),
        time: 600_000,
    });

    collector.on('collect', async ci => {
        try {
            if (ci.customId === `rr_opts_${guildId}`) {
                const option = ci.values[0];
                switch (option) {
                    case 'add_role':
                        await handleAddRole(ci, rootInteraction, activePanelData, guildId, guild, client);
                        break;
                    case 'remove_role':
                        await handleRemoveRole(ci, rootInteraction, activePanelData, validPanels, guildId, guild, client);
                        break;
                }
            }
        } catch (error) {
            logger.error('Error in reactroles dashboard collector:', error);
            const msg =
                error instanceof TitanBotError
                    ? error.userMessage || 'An error occurred.'
                    : 'An unexpected error occurred.';
            if (!ci.replied && !ci.deferred) await ci.deferUpdate().catch(() => {});
            await ci
                .followUp({ embeds: [errorEmbed('Error', msg)], flags: MessageFlags.Ephemeral })
                .catch(() => {});
        }
    });

    buttonCollector.on('collect', async btnInteraction => {
        try {
            if (btnInteraction.customId === `rr_edit_text_${guildId}`) {
                await handleEditText(btnInteraction, rootInteraction, activePanelData, guildId, guild, client);
            } else if (btnInteraction.customId === `rr_delete_${guildId}`) {
                await handleDeletePanel(btnInteraction, rootInteraction, activePanelData, validPanels, guildId, guild, client, collector, buttonCollector);
            }
        } catch (error) {
            logger.error('Error in reactroles button collector:', error);
            const msg =
                error instanceof TitanBotError
                    ? error.userMessage || 'An error occurred.'
                    : 'An unexpected error occurred.';
            if (!btnInteraction.replied && !btnInteraction.deferred) await btnInteraction.deferUpdate().catch(() => {});
            await btnInteraction
                .followUp({ embeds: [errorEmbed('Error', msg)], flags: MessageFlags.Ephemeral })
                .catch(() => {});
        }
    });

    collector.on('end', async (_, reason) => {
        buttonCollector.stop();
        if (reason === 'time') {
            const timeoutEmbed = new EmbedBuilder()
                .setTitle('⏱️ Dashboard Timeout')
                .setDescription('This dashboard session has timed out due to inactivity (10 minutes).\n\nTo continue managing your reaction roles, please run `/reactroles dashboard` again.')
                .setColor(getColor('warning'));
            
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [timeoutEmbed],
                components: []
            }).catch(() => {});
        }
    });
}

// ─── Discord Message Helpers ──────────────────────────────────────────────────

async function fetchPanelDiscordMessage(guild, panelData) {
    try {
        const channel = guild.channels.cache.get(panelData.channelId);
        if (!channel) return null;
        return await channel.messages.fetch(panelData.messageId).catch(() => null);
    } catch {
        return null;
    }
}

async function rebuildLivePanelMessage(guild, panelData) {
    try {
        const channel = guild.channels.cache.get(panelData.channelId);
        if (!channel) return;
        const msg = await channel.messages.fetch(panelData.messageId).catch(() => null);
        if (!msg || !msg.embeds[0]) return;

        const roleObjects = panelData.roles
            .map(id => guild.roles.cache.get(id))
            .filter(Boolean);

        if (roleObjects.length === 0) return;

        const currentEmbed = msg.embeds[0];
        const updatedEmbed = EmbedBuilder.from(currentEmbed);
        const fields = currentEmbed.fields.map(f => ({ name: f.name, value: f.value, inline: f.inline }));
        const roleFieldIdx = fields.findIndex(f => f.name === 'Available Roles');
        const newRoleValue = roleObjects.map(r => `• ${r}`).join('\n');
        if (roleFieldIdx !== -1) {
            fields[roleFieldIdx] = { name: 'Available Roles', value: newRoleValue, inline: false };
        } else {
            fields.push({ name: 'Available Roles', value: newRoleValue, inline: false });
        }
        updatedEmbed.setFields(fields);

        const selectRow = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('reaction_roles')
                .setPlaceholder('Select your roles')
                .setMinValues(0)
                .setMaxValues(roleObjects.length)
                .addOptions(
                    roleObjects.map(r => ({
                        label: r.name.substring(0, 100),
                        description: `Add/remove the ${r.name} role`.substring(0, 100),
                        value: r.id,
                        emoji: '🎭',
                    })),
                ),
        );

        await msg.edit({ embeds: [updatedEmbed], components: [selectRow] });
    } catch (error) {
        logger.warn('Could not rebuild live reaction role panel:', error.message);
    }
}

// ─── View Builders ────────────────────────────────────────────────────────────

async function showPanelDashboard(interaction, panelData, discordMsg, guildId, guild) {
    const channel = guild.channels.cache.get(panelData.channelId);
    const title = discordMsg?.embeds?.[0]?.title ?? 'Untitled Panel';
    const roleList =
        panelData.roles.length > 0
            ? panelData.roles.map(id => `<@&${id}>`).join(', ')
            : '`None`';

    const embed = new EmbedBuilder()
        .setTitle('🎭 Reaction Roles Dashboard')
        .setDescription(
            `**Title:** ${title}\n\nSelect an option below to modify a setting.${discordMsg ? `\n[Click Here to View Panel](${discordMsg.url})` : ''}`,
        )
        .setColor(getColor('info'))
        .addFields(
            { name: '📍 Channel', value: channel ? `<#${channel.id}>` : '`Not found`', inline: true },
            { name: '🎭 Roles', value: `\`${panelData.roles.length} / 25\``, inline: true },
            { name: '\u200B', value: '\u200B', inline: true },
            { name: '🏷️ Role List', value: roleList, inline: false },
        )
        .setFooter({ text: 'Dashboard closes after 10 minutes of inactivity' })
        .setTimestamp();

    const editTextButton = new ButtonBuilder()
        .setCustomId(`rr_edit_text_${guildId}`)
        .setLabel('Edit Panel Text')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('✏️');

    const deleteButton = new ButtonBuilder()
        .setCustomId(`rr_delete_${guildId}`)
        .setLabel('Delete Panel')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('🗑️');

    const optionsSelect = new StringSelectMenuBuilder()
        .setCustomId(`rr_opts_${guildId}`)
        .setPlaceholder('Select an action...')
        .addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel('Add Role')
                .setDescription('Add a role to this panel (up to 25 total)')
                .setValue('add_role')
                .setEmoji('➕'),
            ...(panelData.roles.length > 0 ? [
                new StringSelectMenuOptionBuilder()
                    .setLabel('Remove Role')
                    .setDescription('Remove a role from this panel')
                    .setValue('remove_role')
                    .setEmoji('➖')
            ] : [])
        );

    await InteractionHelper.safeEditReply(interaction, {
        embeds: [embed],
        components: [
            new ActionRowBuilder().addComponents(editTextButton, deleteButton),
            new ActionRowBuilder().addComponents(optionsSelect),
        ],
    });
}

// ─── Edit Panel Text ──────────────────────────────────────────────────────────

async function handleEditText(buttonInteraction, rootInteraction, panelData, guildId, guild, client) {
    const channel = guild.channels.cache.get(panelData.channelId);
    const discordMsg = channel
        ? await channel.messages.fetch(panelData.messageId).catch(() => null)
        : null;

    const currentTitle = discordMsg?.embeds?.[0]?.title ?? '';
    const currentDesc = discordMsg?.embeds?.[0]?.description ?? '';

    const modal = new ModalBuilder()
        .setCustomId('rr_edit_text')
        .setTitle('Edit Panel Text')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('panel_title')
                    .setLabel('Title')
                    .setStyle(TextInputStyle.Short)
                    .setValue(currentTitle)
                    .setMaxLength(256)
                    .setMinLength(1)
                    .setRequired(true),
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('panel_description')
                    .setLabel('Description')
                    .setStyle(TextInputStyle.Paragraph)
                    .setValue(currentDesc)
                    .setMaxLength(2048)
                    .setMinLength(1)
                    .setRequired(true),
            ),
        );

    try {
        await buttonInteraction.showModal(modal);
    } catch (error) {
        logger.error('Error showing edit text modal:', error);
        await buttonInteraction.followUp({
            embeds: [errorEmbed('Error', 'Failed to show the edit panel text modal. Please try again.')],
            flags: MessageFlags.Ephemeral,
        }).catch(() => {});
        return;
    }

    const submitted = await buttonInteraction
        .awaitModalSubmit({
            filter: i =>
                i.customId === 'rr_edit_text' && i.user.id === buttonInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!submitted) return;

    const newTitle = submitted.fields.getTextInputValue('panel_title').trim();
    const newDesc = submitted.fields.getTextInputValue('panel_description').trim();

    if (discordMsg) {
        const updatedEmbed = EmbedBuilder.from(discordMsg.embeds[0]).setTitle(newTitle).setDescription(newDesc);
        await discordMsg.edit({ embeds: [updatedEmbed] }).catch(err => {
            logger.warn('Could not edit live panel message:', err.message);
        });
    }

    await submitted.reply({
        embeds: [successEmbed('✅ Panel Updated', 'The title and description have been updated.')],
        flags: MessageFlags.Ephemeral,
    });

    const refreshedMsg = channel
        ? await channel.messages.fetch(panelData.messageId).catch(() => null)
        : null;
    await showPanelDashboard(rootInteraction, panelData, refreshedMsg, guildId, guild);
}

// ─── Add Role ─────────────────────────────────────────────────────────────────

async function handleAddRole(selectInteraction, rootInteraction, panelData, guildId, guild, client) {
    await selectInteraction.deferUpdate();

    if (panelData.roles.length >= 25) {
        await selectInteraction.followUp({
            embeds: [errorEmbed('Panel Full', 'This panel already has the maximum of 25 roles.')],
            flags: MessageFlags.Ephemeral,
        });
        return;
    }

    const roleSelect = new RoleSelectMenuBuilder()
        .setCustomId('rr_add_role_pick')
        .setPlaceholder('Select a role to add...')
        .setMaxValues(1);

    await selectInteraction.followUp({
        embeds: [
            new EmbedBuilder()
                .setTitle('➕ Add Role')
                .setDescription(
                    `**Current roles:** ${panelData.roles.length}/25\n\nSelect a role to add to this panel.`,
                )
                .setColor(getColor('info')),
        ],
        components: [new ActionRowBuilder().addComponents(roleSelect)],
        flags: MessageFlags.Ephemeral,
    });

    const roleCollector = rootInteraction.channel.createMessageComponentCollector({
        componentType: ComponentType.RoleSelect,
        filter: i =>
            i.user.id === selectInteraction.user.id && i.customId === 'rr_add_role_pick',
        time: 60_000,
        max: 1,
    });

    roleCollector.on('collect', async roleInteraction => {
        await roleInteraction.deferUpdate();
        const role = roleInteraction.roles.first();

        if (panelData.roles.includes(role.id)) {
            await roleInteraction.followUp({
                embeds: [errorEmbed('Already Added', `${role} is already in this panel.`)],
                flags: MessageFlags.Ephemeral,
            });
            return;
        }
        if (role.id === guild.id) {
            await roleInteraction.followUp({
                embeds: [errorEmbed('Invalid Role', 'You cannot use @everyone.')],
                flags: MessageFlags.Ephemeral,
            });
            return;
        }
        if (role.managed) {
            await roleInteraction.followUp({
                embeds: [errorEmbed('Invalid Role', 'Managed/bot roles cannot be used.')],
                flags: MessageFlags.Ephemeral,
            });
            return;
        }
        if (hasDangerousPermissions(role)) {
            await roleInteraction.followUp({
                embeds: [
                    errorEmbed(
                        'Dangerous Permissions',
                        'That role has sensitive permissions (Administrator, Manage Server, etc.) and cannot be used.',
                    ),
                ],
                flags: MessageFlags.Ephemeral,
            });
            return;
        }
        if (role.position >= guild.members.me.roles.highest.position) {
            await roleInteraction.followUp({
                embeds: [
                    errorEmbed(
                        'Role Too High',
                        "That role is above my highest role in the hierarchy. Move my role above it first.",
                    ),
                ],
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        panelData.roles.push(role.id);
        const key = `reaction_roles:${guildId}:${panelData.messageId}`;
        await client.db.set(key, panelData);

        await rebuildLivePanelMessage(guild, panelData);

        await roleInteraction.followUp({
            embeds: [successEmbed('✅ Role Added', `${role} has been added to the panel.`)],
            flags: MessageFlags.Ephemeral,
        });

        const channel = guild.channels.cache.get(panelData.channelId);
        const discordMsg = channel
            ? await channel.messages.fetch(panelData.messageId).catch(() => null)
            : null;
        await showPanelDashboard(rootInteraction, panelData, discordMsg, guildId, guild);
    });

    roleCollector.on('end', (collected, reason) => {
        if (reason === 'time' && collected.size === 0) {
            selectInteraction
                .followUp({
                    embeds: [errorEmbed('Timed Out', 'No role selected. Nothing was changed.')],
                    flags: MessageFlags.Ephemeral,
                })
                .catch(() => {});
        }
    });
}

// ─── Remove Role ──────────────────────────────────────────────────────────────

async function handleRemoveRole(selectInteraction, rootInteraction, panelData, panels, guildId, guild, client) {
    await selectInteraction.deferUpdate();

    const roleOptions = panelData.roles
        .map(id => {
            const role = guild.roles.cache.get(id);
            return role ? { label: role.name.substring(0, 100), value: id } : null;
        })
        .filter(Boolean);

    if (roleOptions.length === 0) {
        await selectInteraction.followUp({
            embeds: [errorEmbed('No Valid Roles', 'The roles on this panel no longer exist in the server.')],
            flags: MessageFlags.Ephemeral,
        });
        return;
    }

    const removeSelect = new StringSelectMenuBuilder()
        .setCustomId('rr_remove_role_pick')
        .setPlaceholder('Select a role to remove...')
        .setMaxValues(1)
        .addOptions(
            roleOptions.map(r =>
                new StringSelectMenuOptionBuilder().setLabel(r.label).setValue(r.value).setEmoji('🎭'),
            ),
        );

    await selectInteraction.followUp({
        embeds: [
            new EmbedBuilder()
                .setTitle('➖ Remove Role')
                .setDescription('Select the role you want to remove from this panel.')
                .setColor(getColor('info')),
        ],
        components: [new ActionRowBuilder().addComponents(removeSelect)],
        flags: MessageFlags.Ephemeral,
    });

    const removeCollector = rootInteraction.channel.createMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        filter: i =>
            i.user.id === selectInteraction.user.id && i.customId === 'rr_remove_role_pick',
        time: 60_000,
        max: 1,
    });

    removeCollector.on('collect', async removeInteraction => {
        await removeInteraction.deferUpdate();
        const roleId = removeInteraction.values[0];
        const role = guild.roles.cache.get(roleId);

        panelData.roles = panelData.roles.filter(id => id !== roleId);

        if (panelData.roles.length === 0) {
            const channel = guild.channels.cache.get(panelData.channelId);
            if (channel) {
                const msg = await channel.messages.fetch(panelData.messageId).catch(() => null);
                if (msg) await msg.delete().catch(() => {});
            }
            await deleteReactionRoleMessage(client, guildId, panelData.messageId);

            await removeInteraction.followUp({
                embeds: [
                    successEmbed(
                        '✅ Role Removed',
                        'That was the last role on the panel. The panel has been deleted.',
                    ),
                ],
                flags: MessageFlags.Ephemeral,
            });

            // Remove the deleted panel from the array
            const panelIndex = panels.findIndex(p => p.messageId === panelData.messageId);
            if (panelIndex > -1) {
                panels.splice(panelIndex, 1);
            }

            if (panels.length === 0) {
                await InteractionHelper.safeEditReply(rootInteraction, {
                    embeds: [
                        new EmbedBuilder()
                            .setTitle('📋 Reaction Roles Dashboard')
                            .setDescription('No panels remain. Use `/reactroles setup` to create one.')
                            .setColor(getColor('info')),
                    ],
                    components: [],
                });
            } else {
                // Dashboard closed after last role removed
                await InteractionHelper.safeEditReply(rootInteraction, {
                    embeds: [
                        new EmbedBuilder()
                            .setTitle('📋 Reaction Roles Dashboard')
                            .setDescription('Panel deleted. Run `/reactroles dashboard` to manage another panel.')
                            .setColor(getColor('success')),
                    ],
                    components: [],
                });
            }
        } else {
            const key = `reaction_roles:${guildId}:${panelData.messageId}`;
            await client.db.set(key, panelData);
            await rebuildLivePanelMessage(guild, panelData);

            await removeInteraction.followUp({
                embeds: [
                    successEmbed(
                        '✅ Role Removed',
                        `${role ? role.toString() : `<@&${roleId}>`} has been removed from the panel.`,
                    ),
                ],
                flags: MessageFlags.Ephemeral,
            });

            const channel = guild.channels.cache.get(panelData.channelId);
            const discordMsg = channel
                ? await channel.messages.fetch(panelData.messageId).catch(() => null)
                : null;
            await showPanelDashboard(rootInteraction, panelData, discordMsg, guildId, guild);
        }
    });

    removeCollector.on('end', (collected, reason) => {
        if (reason === 'time' && collected.size === 0) {
            selectInteraction
                .followUp({
                    embeds: [errorEmbed('Timed Out', 'No role selected. Nothing was changed.')],
                    flags: MessageFlags.Ephemeral,
                })
                .catch(() => {});
        }
    });
}

// ─── Delete Panel ─────────────────────────────────────────────────────────────

async function handleDeletePanel(btnInteraction, rootInteraction, panelData, panels, guildId, guild, client, collector, buttonCollector) {
    const channel = guild.channels.cache.get(panelData.channelId);
    const discordMsg = channel
        ? await channel.messages.fetch(panelData.messageId).catch(() => null)
        : null;
    const title = discordMsg?.embeds?.[0]?.title ?? 'this panel';

    const deleteModal = new ModalBuilder()
        .setCustomId('rr_delete_confirm_modal')
        .setTitle('Delete Reaction Role Panel');

    const deleteWarningText = new TextDisplayBuilder()
        .setContent(`⚠️ You are about to permanently delete the panel **${title}**. This will remove the Discord message and all associated reaction role assignments.`);

    const deleteCheckbox = new CheckboxBuilder()
        .setCustomId('delete_confirmation')
        .setDefault(false);

    const deleteCheckboxLabel = new LabelBuilder()
        .setLabel('I confirm — this cannot be undone')
        .setCheckboxComponent(deleteCheckbox);

    deleteModal
        .addTextDisplayComponents(deleteWarningText)
        .addLabelComponents(deleteCheckboxLabel);

    await btnInteraction.showModal(deleteModal);

    const submitted = await btnInteraction
        .awaitModalSubmit({
            filter: i => i.customId === 'rr_delete_confirm_modal' && i.user.id === btnInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!submitted) {
        await showPanelDashboard(rootInteraction, panelData, discordMsg, guildId, guild);
        return;
    }

    const confirmed = submitted.fields.getCheckbox('delete_confirmation');

    if (!confirmed) {
        await submitted.reply({
            embeds: [errorEmbed('Not Confirmed', 'You must tick the confirmation checkbox to delete the panel.')],
            flags: MessageFlags.Ephemeral,
        });
        await showPanelDashboard(rootInteraction, panelData, discordMsg, guildId, guild);
        return;
    }

    await submitted.deferUpdate();

    if (discordMsg) {
        await discordMsg.delete().catch(() => {});
    }
    await deleteReactionRoleMessage(client, guildId, panelData.messageId);

    try {
        await logEvent({
            client,
            guildId,
            eventType: EVENT_TYPES.REACTION_ROLE_DELETE,
            data: {
                description: `Reaction role panel deleted by ${submitted.user.tag}`,
                userId: submitted.user.id,
                channelId: panelData.channelId,
                fields: [
                    { name: '📋 Panel', value: title, inline: true },
                    { name: '📍 Channel', value: channel ? channel.toString() : 'Unknown', inline: true },
                ],
            },
        });
    } catch (logErr) {
        logger.warn('Failed to log reaction role deletion:', logErr);
    }

    await submitted.followUp({
        embeds: [successEmbed('✅ Panel Deleted', `**${title}** has been deleted.`)],
        flags: MessageFlags.Ephemeral,
    });

    // Remove the deleted panel from the array
    const panelIndex = panels.findIndex(p => p.messageId === panelData.messageId);
    if (panelIndex > -1) {
        panels.splice(panelIndex, 1);
    }

    if (panels.length === 0) {
        collector.stop();
        buttonCollector.stop();
        await InteractionHelper.safeEditReply(rootInteraction, {
            embeds: [
                new EmbedBuilder()
                    .setTitle('📋 Reaction Roles Dashboard')
                    .setDescription('No panels remain. Use `/reactroles setup` to create one.')
                    .setColor(getColor('info')),
            ],
            components: [],
        });
    } else {
        // Close the dashboard after deletion
        collector.stop();
        buttonCollector.stop();
        await InteractionHelper.safeEditReply(rootInteraction, {
            embeds: [
                new EmbedBuilder()
                    .setTitle('📋 Reaction Roles Dashboard')
                    .setDescription('Panel deleted. Run `/reactroles dashboard` to manage another panel.')
                    .setColor(getColor('success')),
            ],
            components: [],
        });
    }
}