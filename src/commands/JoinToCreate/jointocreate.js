import { getColor } from '../../config/bot.js';
import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder } from 'discord.js';
import { successEmbed, warningEmbed } from '../../utils/embeds.js';
import { createJoinToCreatePanel } from '../../utils/joinToCreatePanel.js';
import { logger } from '../../utils/logger.js';
import { TitanBotError, ErrorTypes, replyUserError } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import {
    initializeJoinToCreate,
    getChannelConfiguration,
    updateChannelConfig,
    removeTriggerChannel,
    hasManageGuildPermission,
    logConfigurationChange,
    getConfiguration
} from '../../services/joinToCreateService.js';

export default {
    data: new SlashCommandBuilder()
        .setName("jointocreate")
        .setDescription("Manage Join to Create voice channels system.")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .setDMPermission(false)
        .addSubcommand((subcommand) =>
            subcommand
                .setName("setup")
                .setDescription("Set up a new Join to Create voice channel.")
                .addChannelOption((option) =>
                    option
                        .setName("category")
                        .setDescription("Category for the new trigger and temporary voice channels.")
                        .addChannelTypes(ChannelType.GuildCategory)
                )
                .addChannelOption((option) =>
                    option
                        .setName("trigger_channel")
                        .setDescription("Use an existing voice channel as the Join to Create trigger.")
                        .addChannelTypes(ChannelType.GuildVoice)
                )
                .addStringOption((option) =>
                    option
                        .setName("channel_name")
                        .setDescription("Custom name template. Use {username}, {displayName}, {guildName}, {channelName}.")
                        .setMaxLength(100)
                )
                .addIntegerOption((option) =>
                    option
                        .setName("user_limit")
                        .setDescription("Maximum number of users in temporary channels. (0 = unlimited)")
                )
                .addIntegerOption((option) =>
                    option
                        .setName("bitrate")
                        .setDescription("Bitrate for temporary channels in kbps (8-96).")
                )
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("dashboard")
                .setDescription("Configure an existing Join to Create system.")
                .addChannelOption((option) =>
                    option
                        .setName("trigger_channel")
                        .setDescription("The Join to Create trigger channel to configure.")
                        .setRequired(true)
                        .addChannelTypes(ChannelType.GuildVoice)
                )
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("panel")
                .setDescription("Post the temporary voice control panel in this channel.")
        ),
    category: "utility",

    async execute(interaction, config, client) {
        try {
            
            if (!hasManageGuildPermission(interaction.member)) {
                throw new TitanBotError(
                    'User lacks ManageGuild permission',
                    ErrorTypes.PERMISSION,
                    'You need **Manage Server** permission to use this command.'
                );
            }

            const subcommand = interaction.options.getSubcommand();
            await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });

            let responseEmbed;

            if (subcommand === "setup") {
                await handleSetupSubcommand(interaction, client);
                return;
            } else if (subcommand === "dashboard") {
                await handleConfigSubcommand(interaction, client);
                return;
            } else if (subcommand === "panel") {
                await handlePanelSubcommand(interaction, client);
                return;
            }

        } catch (error) {
            try {
                let errorMessage = 'An error occurred while executing this command.';
                
                if (error instanceof TitanBotError) {
                    errorMessage = error.userMessage || 'An error occurred. Please try again.';
                    logger.debug(`TitanBotError [${error.type}]: ${error.message}`, error.context || {});
                } else {
                    logger.error('Unexpected error in jointocreate command:', error);
                    errorMessage = 'An unexpected error occurred. Please try again or contact support.';
                }

                return replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: errorMessage });
            } catch (replyError) {
                logger.error('Failed to send error message:', replyError);
            }
        }
    }
};

async function handleSetupSubcommand(interaction, client) {
    try {
        const category = interaction.options.getChannel('category');
        const selectedTriggerChannel = interaction.options.getChannel('trigger_channel');
        const nameTemplate = interaction.options.getString('channel_name') || "{username}'s Room";
        const userLimit = interaction.options.getInteger('user_limit') || 0;
        const bitrate = interaction.options.getInteger('bitrate') || 64;
        const guildId = interaction.guild.id;

        if (category && selectedTriggerChannel) {
            throw new TitanBotError(
                'Both a category and an existing trigger channel were selected',
                ErrorTypes.VALIDATION,
                'Pilih `category` untuk membuat trigger baru, atau `trigger_channel` untuk memakai channel yang sudah ada. Jangan isi keduanya.'
            );
        }

        logger.debug(`Setting up Join to Create in guild ${guildId} with template: ${nameTemplate}`);

        const existingConfig = await getConfiguration(client, guildId);
        
        if (Array.isArray(existingConfig.triggerChannels) && existingConfig.triggerChannels.length > 0) {
            const activeTriggerChannels = [];
            const staleTriggerChannelIds = [];

            for (const existingChannelId of existingConfig.triggerChannels) {
                const existingChannel = await interaction.guild.channels.fetch(existingChannelId).catch(() => null);
                if (existingChannel) {
                    activeTriggerChannels.push(existingChannel);
                } else {
                    staleTriggerChannelIds.push(existingChannelId);
                }
            }

            if (staleTriggerChannelIds.length > 0) {
                for (const staleChannelId of staleTriggerChannelIds) {
                    logger.info(`Cleaning up stale JTC trigger ${staleChannelId} from guild ${guildId}`);
                    await removeTriggerChannel(client, guildId, staleChannelId);
                }
            }

            if (activeTriggerChannels.length > 0) {
                const primaryTrigger = activeTriggerChannels[0];
                const errorMessage = `This server already has a Join to Create channel set up: ${primaryTrigger}\n\nUse \`/jointocreate dashboard\` to modify it, or remove it first before creating a new one.`;

                throw new TitanBotError(
                    'Guild already has a Join to Create channel',
                    ErrorTypes.VALIDATION,
                    errorMessage,
                    {
                        guildId,
                        activeTriggerCount: activeTriggerChannels.length,
                        expected: true,
                        suppressErrorLog: true
                    }
                );
            }
        }

        let triggerChannel = selectedTriggerChannel;
        if (triggerChannel) {
            const botMember = interaction.guild.members.me;
            const permissions = botMember ? triggerChannel.permissionsFor(botMember) : null;
            if (!permissions?.has([
                PermissionFlagsBits.ManageChannels,
                PermissionFlagsBits.MoveMembers,
                PermissionFlagsBits.Connect
            ])) {
                throw new TitanBotError(
                    'Bot lacks permissions in the selected trigger channel',
                    ErrorTypes.PERMISSION,
                    `Bot perlu izin **Manage Channels**, **Move Members**, dan **Connect** di ${triggerChannel}.`
                );
            }
        } else {
            logger.debug('Creating Join to Create trigger channel...');
            triggerChannel = await interaction.guild.channels.create({
                name: 'Join to Create',
                type: ChannelType.GuildVoice,
                parent: category?.id,
                userLimit: 0,
                bitrate: 64000,
                permissionOverwrites: [
                    {
                        id: interaction.guild.id,
                        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect],
                    },
                ],
            });
        }

        logger.debug(`Created trigger channel ${triggerChannel.id}, initializing config...`);

        const config = await initializeJoinToCreate(client, guildId, triggerChannel.id, {
            nameTemplate: nameTemplate,
            userLimit: userLimit,
            bitrate: bitrate * 1000,
            categoryId: triggerChannel.parentId
        });

        await logConfigurationChange(client, guildId, interaction.user.id, 'Initialized Join to Create', {
            channelId: triggerChannel.id,
            nameTemplate,
            userLimit,
            bitrate
        });

        logger.info(`Successfully created Join to Create system in guild ${guildId}`);

        const responseEmbed = successEmbed(
            '✅ Setup Complete',
            `${selectedTriggerChannel ? 'Set up existing trigger channel' : 'Created Join to Create channel'}: ${triggerChannel}\n\n` +
            `**Settings:**\n` +
            `• Template: \`${nameTemplate}\`\n` +
            `• User Limit: ${userLimit === 0 ? 'Unlimited' : userLimit + ' users'}\n` +
            `• Bitrate: ${bitrate} kbps\n` +
            `${triggerChannel.parent ? `• Category: ${triggerChannel.parent.name}` : '• Category: Root level'}`
        );

        await interaction.channel.send(createJoinToCreatePanel()).catch((error) => {
            logger.warn(`Failed to post Join to Create panel in guild ${guildId}: ${error.message}`);
        });

        return await InteractionHelper.safeEditReply(interaction, { embeds: [responseEmbed] });

    } catch (error) {
        logger.error('Error in handleSetupSubcommand:', error);
        if (error instanceof TitanBotError) {
            throw error;
        }
        throw new TitanBotError(
            `Setup failed: ${error.message}`,
            ErrorTypes.DISCORD_API,
            'Failed to set up Join to Create system. Please check bot permissions.'
        );
    }
}

async function handlePanelSubcommand(interaction, client) {
    const channel = interaction.channel;

    if (!channel?.isTextBased() || typeof channel.send !== 'function') {
        throw new TitanBotError(
            'The current channel cannot receive messages',
            ErrorTypes.VALIDATION,
            'Run this command in a text channel where the bot can send messages.'
        );
    }

    await channel.send(createJoinToCreatePanel());

    return await InteractionHelper.safeEditReply(interaction, {
        embeds: [successEmbed('Panel Posted', `The voice control panel was posted in ${channel}.`)]
    });
}

async function handleConfigSubcommand(interaction, client) {
    try {
        const triggerChannel = interaction.options.getChannel('trigger_channel');
        const guildId = interaction.guild.id;

        const currentConfig = await getChannelConfiguration(client, guildId, triggerChannel.id);
        const channelConfig = currentConfig.channelConfig || {};

        const configEmbed = new EmbedBuilder()
            .setTitle('Join to Create Configuration')
            .setDescription(`Configuration for ${triggerChannel}`)
            .setColor(getColor('info'))
            .addFields(
                {
                    name: 'Channel Name Template',
                    value: `\`${channelConfig.nameTemplate || currentConfig.channelNameTemplate || "{username}'s Room"}\``,
                    inline: false
                },
                {
                    name: 'User Limit',
                    value: `${(channelConfig.userLimit ?? currentConfig.userLimit ?? 0) === 0 ? 'Unlimited' : (channelConfig.userLimit ?? currentConfig.userLimit ?? 0) + ' users'}`,
                    inline: true
                },
                {
                    name: 'Bitrate',
                    value: `${(channelConfig.bitrate ?? currentConfig.bitrate ?? 64000) / 1000} kbps`,
                    inline: true
                }
            )
            .setFooter({ text: 'Use the buttons below to modify settings • Only one trigger channel is supported per guild' })
            .setTimestamp();

        const nameButton = new ButtonBuilder()
            .setCustomId(`jtc_config_name_${triggerChannel.id}`)
            .setLabel('📝 Name Template')
            .setStyle(ButtonStyle.Primary);

        const limitButton = new ButtonBuilder()
            .setCustomId(`jtc_config_limit_${triggerChannel.id}`)
            .setLabel('👥 User Limit')
            .setStyle(ButtonStyle.Primary);

        const bitrateButton = new ButtonBuilder()
            .setCustomId(`jtc_config_bitrate_${triggerChannel.id}`)
            .setLabel('🎵 Bitrate')
            .setStyle(ButtonStyle.Primary);

        const deleteButton = new ButtonBuilder()
            .setCustomId(`jtc_config_delete_${triggerChannel.id}`)
            .setLabel('🗑️ Remove Channel')
            .setStyle(ButtonStyle.Danger);

        const row = new ActionRowBuilder().addComponents(nameButton, limitButton, bitrateButton, deleteButton);

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [configEmbed],
            components: [row]
        });

        const message = await interaction.fetchReply();

        if (!message || typeof message.createMessageComponentCollector !== 'function') {
            throw new TitanBotError(
                'Failed to fetch interaction reply for collector setup',
                ErrorTypes.DISCORD_API,
                'Failed to open configuration controls. Please run `/jointocreate dashboard` again.'
            );
        }

        const collector = message.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 300000
        });

        collector.on('collect', async (buttonInteraction) => {
            try {
                
                if (!hasManageGuildPermission(buttonInteraction.member)) {
                    await buttonInteraction.reply({
                        content: '❌ You need **Manage Server** permission to use these controls.',
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }

                const customId = buttonInteraction.customId;

                if (customId.includes('jtc_config_name_')) {
                    await handleNameTemplateModal(buttonInteraction, triggerChannel, currentConfig, client);
                } else if (customId.includes('jtc_config_limit_')) {
                    await handleUserLimitModal(buttonInteraction, triggerChannel, currentConfig, client);
                } else if (customId.includes('jtc_config_bitrate_')) {
                    await handleBitrateModal(buttonInteraction, triggerChannel, currentConfig, client);
                } else if (customId.includes('jtc_config_delete_')) {
                    await handleChannelDeletion(buttonInteraction, triggerChannel, currentConfig, client);
                }
            } catch (error) {
                const userMessage = error instanceof TitanBotError
                    ? error.userMessage || 'An error occurred.'
                    : 'An error occurred while processing your request.';

                if (error instanceof TitanBotError) {
                    logger.debug(`Button interaction validation error: ${error.message}`, error.context || {});
                } else {
                    logger.error('Unexpected error in config button interaction:', error);
                }

                await buttonInteraction.reply({
                    content: `❌ ${userMessage}`,
                    flags: MessageFlags.Ephemeral
                }).catch(() => {});
            }
        });

        collector.on('end', () => {
            const disabledRow = new ActionRowBuilder().addComponents(
                nameButton.setDisabled(true),
                limitButton.setDisabled(true),
                bitrateButton.setDisabled(true),
                deleteButton.setDisabled(true)
            );

            message.edit({
                components: [disabledRow],
                embeds: [configEmbed.setFooter({ text: 'Configuration session expired. Run the command again to make changes.' })]
            }).catch(() => {});
        });

    } catch (error) {
        if (error instanceof TitanBotError) {
            throw error;
        }
        throw new TitanBotError(
            `Config failed: ${error.message}`,
            ErrorTypes.DATABASE,
            'Failed to load configuration.'
        );
    }
}

async function handleNameTemplateModal(interaction, triggerChannel, currentConfig, client) {
    try {
        const currentTemplate = currentConfig.channelConfig?.nameTemplate
            || currentConfig.channelNameTemplate
            || "{username}'s Room";

        const modal = new ModalBuilder()
            .setCustomId(`jtc_name_modal_${triggerChannel.id}`)
            .setTitle('Channel Name Template')
            .addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('name_template')
                        .setLabel('Template ({username}, {displayName}, ...)')
                        .setPlaceholder("{username}'s Room")
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true)
                        .setMaxLength(100)
                        .setValue(currentTemplate)
                )
            );

        await interaction.showModal(modal);

        const modalSubmission = await interaction.awaitModalSubmit({
            filter: (i) => i.customId === `jtc_name_modal_${triggerChannel.id}` && i.user.id === interaction.user.id,
            time: 60000
        });

        if (!hasManageGuildPermission(modalSubmission.member)) {
            await modalSubmission.reply({
                content: '❌ You need **Manage Server** permission to modify these settings.',
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        const newTemplate = modalSubmission.fields.getTextInputValue('name_template').trim();

        await updateChannelConfig(client, interaction.guild.id, triggerChannel.id, {
            nameTemplate: newTemplate
        });

        await logConfigurationChange(client, interaction.guild.id, interaction.user.id, 'Updated channel name template', {
            channelId: triggerChannel.id,
            newTemplate
        });

        await modalSubmission.reply({
            embeds: [successEmbed('Updated', `Channel name template changed to \`${newTemplate}\``)],
            flags: MessageFlags.Ephemeral
        });

    } catch (error) {
        if (error.code === 'INTERACTION_COLLECTOR_ERROR') {
            return;
        }
        if (error instanceof TitanBotError) {
            throw error;
        }
        logger.error('Unexpected error in name template modal:', error);
        throw new TitanBotError(
            `Modal error: ${error.message}`,
            ErrorTypes.UNKNOWN,
            'An error occurred while updating the template.'
        );
    }
}

async function handleUserLimitModal(interaction, triggerChannel, currentConfig, client) {
    try {
        const currentLimit = currentConfig.channelConfig?.userLimit ?? currentConfig.userLimit ?? 0;

        const modal = new ModalBuilder()
            .setCustomId(`jtc_limit_modal_${triggerChannel.id}`)
            .setTitle('Configure User Limit')
            .addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('user_limit')
                        .setLabel('Enter user limit (0-99, 0 = unlimited)')
                        .setPlaceholder('Enter a number between 0 and 99')
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true)
                        .setMinLength(1)
                        .setMaxLength(2)
                        .setValue(currentLimit.toString())
                )
            );

        await interaction.showModal(modal);

        const modalSubmission = await interaction.awaitModalSubmit({
            filter: (i) => i.customId === `jtc_limit_modal_${triggerChannel.id}` && i.user.id === interaction.user.id,
            time: 60000
        });

        if (!hasManageGuildPermission(modalSubmission.member)) {
            await modalSubmission.reply({
                content: '❌ You need **Manage Server** permission to modify these settings.',
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        const userInput = modalSubmission.fields.getTextInputValue('user_limit').trim();

        await updateChannelConfig(client, interaction.guild.id, triggerChannel.id, {
            userLimit: parseInt(userInput)
        });

        await logConfigurationChange(client, interaction.guild.id, interaction.user.id, 'Updated user limit', {
            channelId: triggerChannel.id,
            userLimit: parseInt(userInput)
        });

        await modalSubmission.reply({
            embeds: [successEmbed('Updated', `User limit changed to ${parseInt(userInput) === 0 ? 'Unlimited' : parseInt(userInput) + ' users'}`)],
            flags: MessageFlags.Ephemeral
        });

    } catch (error) {
        if (error.code === 'INTERACTION_COLLECTOR_ERROR') {
            return;
        }
        if (error instanceof TitanBotError) {
            throw error;
        }
        logger.error('Unexpected error in user limit modal:', error);
        throw new TitanBotError(
            `Modal error: ${error.message}`,
            ErrorTypes.UNKNOWN,
            'An error occurred while updating the user limit.'
        );
    }
}

async function handleBitrateModal(interaction, triggerChannel, currentConfig, client) {
    try {
        const currentBitrate = ((currentConfig.channelConfig.bitrate ?? currentConfig.bitrate ?? 64000) / 1000);

        const modal = new ModalBuilder()
            .setCustomId(`jtc_bitrate_modal_${triggerChannel.id}`)
            .setTitle('Configure Bitrate')
            .addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('bitrate')
                        .setLabel('Enter bitrate in kbps (8-384)')
                        .setPlaceholder('Enter a number between 8 and 384')
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true)
                        .setMinLength(1)
                        .setMaxLength(3)
                        .setValue(currentBitrate.toString())
                )
            );

        await interaction.showModal(modal);

        const modalSubmission = await interaction.awaitModalSubmit({
            filter: (i) => i.customId === `jtc_bitrate_modal_${triggerChannel.id}` && i.user.id === interaction.user.id,
            time: 60000
        });

        if (!hasManageGuildPermission(modalSubmission.member)) {
            await modalSubmission.reply({
                content: '❌ You need **Manage Server** permission to modify these settings.',
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        const userInput = modalSubmission.fields.getTextInputValue('bitrate').trim();

        await updateChannelConfig(client, interaction.guild.id, triggerChannel.id, {
            bitrate: parseInt(userInput) * 1000
        });

        await logConfigurationChange(client, interaction.guild.id, interaction.user.id, 'Updated bitrate', {
            channelId: triggerChannel.id,
            bitrate: parseInt(userInput)
        });

        await modalSubmission.reply({
            embeds: [successEmbed('Updated', `Bitrate changed to ${parseInt(userInput)} kbps`)],
            flags: MessageFlags.Ephemeral
        });

    } catch (error) {
        if (error.code === 'INTERACTION_COLLECTOR_ERROR') {
            return;
        }
        if (error instanceof TitanBotError) {
            throw error;
        }
        logger.error('Unexpected error in bitrate modal:', error);
        throw new TitanBotError(
            `Modal error: ${error.message}`,
            ErrorTypes.UNKNOWN,
            'An error occurred while updating the bitrate.'
        );
    }
}

async function handleChannelDeletion(interaction, triggerChannel, currentConfig, client) {
    try {
        const confirmRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`jtc_delete_confirm_${triggerChannel.id}`)
                .setLabel('🗑️ Yes, Delete')
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId(`jtc_delete_cancel_${triggerChannel.id}`)
                .setLabel('❌ Cancel')
                .setStyle(ButtonStyle.Secondary)
        );

        await InteractionHelper.safeReply(interaction, {
            embeds: [warningEmbed('Confirm Deletion', `Are you sure you want to remove **${triggerChannel.name}** from the Join to Create system?\n\nThis action cannot be undone.`)],
            components: [confirmRow],
            flags: MessageFlags.Ephemeral
        });

        const message = await interaction.fetchReply();
        const deleteCollector = message.createMessageComponentCollector({
            componentType: ComponentType.Button,
            filter: (i) => i.user.id === interaction.user.id && 
                          (i.customId === `jtc_delete_confirm_${triggerChannel.id}` || 
                           i.customId === `jtc_delete_cancel_${triggerChannel.id}`),
            time: 600_000,
            max: 1
        });

        deleteCollector.on('collect', async (buttonInteraction) => {
            try {
                
                if (!hasManageGuildPermission(buttonInteraction.member)) {
                    await buttonInteraction.reply({
                        content: '❌ You need **Manage Server** permission to remove channels.',
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }

                if (buttonInteraction.customId === `jtc_delete_confirm_${triggerChannel.id}`) {
                    
                    await removeTriggerChannel(client, interaction.guild.id, triggerChannel.id);

                    await logConfigurationChange(client, interaction.guild.id, interaction.user.id, 'Removed Join to Create trigger', {
                        channelId: triggerChannel.id,
                        channelName: triggerChannel.name
                    });

                    try {
                        if (triggerChannel.members.size === 0) {
                            await triggerChannel.delete('Join to Create trigger removed by administrator');
                        }
                    } catch (deleteError) {
                        logger.warn(`Could not delete channel ${triggerChannel.id}: ${deleteError.message}`);
                        
                    }

                    await buttonInteraction.update({
                        embeds: [successEmbed('Removed', `**${triggerChannel.name}** has been removed from the Join to Create system.`)],
                        components: []
                    });

                } else {
                    await buttonInteraction.update({
                        embeds: [successEmbed('Cancelled', 'Channel removal has been cancelled.')],
                        components: []
                    });
                }
            } catch (collectError) {
                logger.error('Error handling delete confirmation:', collectError);
                await buttonInteraction.reply({
                    content: '❌ An error occurred while processing your request.',
                    flags: MessageFlags.Ephemeral
                }).catch(() => {});
            }
        });

        deleteCollector.on('end', (collected, reason) => {
            if (reason === 'time' && collected.size === 0) {
                message.edit({ components: [] }).catch(() => {});
            }
        });

    } catch (error) {
        if (error instanceof TitanBotError) {
            throw error;
        }
        logger.error('Unexpected error in handleChannelDeletion:', error);
        throw new TitanBotError(
            `Deletion error: ${error.message}`,
            ErrorTypes.UNKNOWN,
            'An error occurred while removing the channel.'
        );
    }
}
