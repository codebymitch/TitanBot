import { getColor } from '../../config/bot.js';
﻿import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { errorEmbed, successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { addJoinToCreateTrigger, getJoinToCreateConfig, updateJoinToCreateConfig } from '../../utils/database.js';


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
                        .setDescription("Category to create the channel in.")
                        .addChannelTypes(ChannelType.GuildCategory)
                )
                .addStringOption((option) =>
                    option
                        .setName("channel_name")
                        .setDescription("Select a template for naming temporary voice channels.")
                        .addChoices(
                            { name: "{username}'s Room (Default)", value: "{username}'s Room" },
                            { name: "{username}'s Channel", value: "{username}'s Channel" },
                            { name: "{username}'s Lounge", value: "{username}'s Lounge" },
                            { name: "{username}'s Space", value: "{username}'s Space" },
                            { name: "{displayName}'s Room", value: "{displayName}'s Room" },
                            { name: "{username}'s VC", value: "{username}'s VC" },
                            { name: "🎵 {username}'s Music Room", value: "🎵 {username}'s Music Room" },
                            { name: "🎮 {username}'s Gaming Room", value: "🎮 {username}'s Gaming Room" },
                            { name: "💬 {username}'s Chat Room", value: "💬 {username}'s Chat Room" },
                            { name: "{username}'s Private Room", value: "{username}'s Private Room" }
                        )
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
                .setName("config")
                .setDescription("Configure an existing Join to Create system.")
                .addChannelOption((option) =>
                    option
                        .setName("trigger_channel")
                        .setDescription("The Join to Create trigger channel to configure.")
                        .setRequired(true)
                        .addChannelTypes(ChannelType.GuildVoice)
                )
        ),
    category: "utility",

    async execute(interaction, config, client) {
        try {
            const subcommand = interaction.options.getSubcommand();
            
            let responseEmbed;
            
            if (subcommand === "setup") {
                const category = interaction.options.getChannel('category');
                const nameTemplate = interaction.options.getString('channel_name') || "{username}'s Room";
                const userLimit = interaction.options.getInteger('user_limit') || 0;
                const bitrate = interaction.options.getInteger('bitrate') || 64;
                const guildId = interaction.guild.id;
                
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });
                
                const existingChannels = await interaction.guild.channels.fetch();
                const existingJoinToCreate = existingChannels.filter(c => 
                    c.type === ChannelType.GuildVoice && 
                    c.name === 'Join to Create'
                );
                
                if (existingJoinToCreate.size > 0) {
                    const triggerChannel = existingJoinToCreate.first();
                    
                    await addJoinToCreateTrigger(client, guildId, triggerChannel.id, {
                        nameTemplate: nameTemplate,
                        userLimit: userLimit,
                        bitrate: bitrate * 1000,
                        categoryId: category?.id
                    });
                    
                    responseEmbed = successEmbed(
                        `Updated existing Join to Create channel: ${triggerChannel}\n\n` +
                        `**New Settings:**\n` +
                        `• Template: \`${nameTemplate}\`\n` +
                        `• User Limit: ${userLimit === 0 ? 'None' : userLimit}\n` +
                        `• Bitrate: ${bitrate} kbps`,
                        '✅ Settings Updated'
                    );
                } else {
                    const triggerChannel = await interaction.guild.channels.create({
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
                    
                    await addJoinToCreateTrigger(client, guildId, triggerChannel.id, {
                        nameTemplate: nameTemplate,
                        userLimit: userLimit,
                        bitrate: bitrate * 1000,
                        categoryId: category?.id
                    });
                    
                    responseEmbed = successEmbed(
                        `Created Join to Create channel: ${triggerChannel}\n\n` +
                        `**Settings:**\n` +
                        `• Template: \`${nameTemplate}\`\n` +
                        `• User Limit: ${userLimit === 0 ? 'None' : userLimit}\n` +
                        `• Bitrate: ${bitrate} kbps`,
                        '✅ Setup Complete'
                    );
                }
            }
            
            else if (subcommand === "config") {
                const triggerChannel = interaction.options.getChannel('trigger_channel');
                
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });
                
                const currentConfig = await getJoinToCreateConfig(client, interaction.guild.id);
                
                if (!currentConfig.triggerChannels.includes(triggerChannel.id)) {
                    throw new Error(`${triggerChannel} is not configured as a Join to Create trigger channel.`);
                }
                
                const channelConfig = currentConfig.channelOptions?.[triggerChannel.id] || {};
                
                const nameSelect = new StringSelectMenuBuilder()
                    .setCustomId(`jtc_config_name_${triggerChannel.id}`)
                    .setPlaceholder('📝 Select a name template')
                    .addOptions(
                        { label: "{username}'s Room (Default)", value: "{username}'s Room", description: "Classic room naming with username", emoji: "🏠" },
                        { label: "{username}'s Channel", value: "{username}'s Channel", description: "Simple channel naming", emoji: "📢" },
                        { label: "{username}'s Lounge", value: "{username}'s Lounge", description: "Casual lounge atmosphere", emoji: "🛋️" },
                        { label: "{username}'s Space", value: "{username}'s Space", description: "Personal space for users", emoji: "🌌" },
                        { label: "{displayName}'s Room", value: "{displayName}'s Room", description: "Uses server nickname instead of username", emoji: "🏷️" },
                        { label: "{username}'s VC", value: "{username}'s VC", description: "Voice Channel abbreviation", emoji: "🎤" },
                        { label: "🎵 {username}'s Music Room", value: "🎵 {username}'s Music Room", description: "Perfect for music sessions", emoji: "🎵" },
                        { label: "🎮 {username}'s Gaming Room", value: "🎮 {username}'s Gaming Room", description: "Gaming focused channel", emoji: "🎮" },
                        { label: "💬 {username}'s Chat Room", value: "💬 {username}'s Chat Room", description: "Great for conversations", emoji: "💬" },
                        { label: "{username}'s Private Room", value: "{username}'s Private Room", description: "Private space for users", emoji: "🔒" }
                    );
                
                const limitButton = new ButtonBuilder()
                    .setCustomId(`jtc_config_limit_${triggerChannel.id}`)
                    .setLabel('👥 Change User Limit')
                    .setStyle(ButtonStyle.Secondary);
                    
                const bitrateButton = new ButtonBuilder()
                    .setCustomId(`jtc_config_bitrate_${triggerChannel.id}`)
                    .setLabel('🎵 Change Bitrate')
                    .setStyle(ButtonStyle.Secondary);
                    
                const deleteButton = new ButtonBuilder()
                    .setCustomId(`jtc_config_delete_${triggerChannel.id}`)
                    .setLabel('🗑️ Remove Channel')
                    .setStyle(ButtonStyle.Danger);
                
                const row1 = new ActionRowBuilder().addComponents(nameSelect);
                const row2 = new ActionRowBuilder().addComponents(limitButton, bitrateButton, deleteButton);
                
                responseEmbed = {
                    title: '⚙️ Join to Create Configuration',
                    description: `Current settings for ${triggerChannel}`,
                    color: getColor('info'),
                    fields: [
                        {
                            name: '📝 Channel Name Template',
                            value: `\`${channelConfig.nameTemplate || currentConfig.channelNameTemplate || "{username}'s Room"}\``,
                            inline: false
                        },
                        {
                            name: '👥 User Limit',
                            value: `${(channelConfig.userLimit || currentConfig.userLimit) === 0 ? 'No limit' : (channelConfig.userLimit || currentConfig.userLimit) + ' users'}`,
                            inline: true
                        },
                        {
                            name: '🎵 Bitrate',
                            value: `${(channelConfig.bitrate || currentConfig.bitrate || 64000) / 1000} kbps`,
                            inline: true
                        }
                    ],
                    footer: { text: 'Use the dropdown and buttons below to modify settings' },
                    timestamp: new Date()
                };
                
                const message = await interaction.editReply({ 
                    embeds: [responseEmbed], 
                    components: [row1, row2] 
                });
                
                const collector = message.createMessageComponentCollector({
time: 300000
                });
                
                collector.on('collect', async (componentInteraction) => {
                    if (!componentInteraction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
                        await componentInteraction.reply({
                            content: '❌ You need **Manage Server** permission to use these controls.',
                            flags: MessageFlags.Ephemeral
                        });
                        return;
                    }
                    
                    const customId = componentInteraction.customId;
                    
                    try {
                        if (customId.includes('jtc_config_name_')) {
                            await handleNameTemplateSelect(componentInteraction, triggerChannel, currentConfig);
                        } else if (customId.includes('jtc_config_limit_')) {
                            await handleUserLimitModal(componentInteraction, triggerChannel, currentConfig);
                        } else if (customId.includes('jtc_config_bitrate_')) {
                            await handleBitrateModal(componentInteraction, triggerChannel, currentConfig);
                        } else if (customId.includes('jtc_config_delete_')) {
                            await handleChannelDeletion(componentInteraction, triggerChannel, currentConfig, collector);
                        }
                    } catch (error) {
                        logger.error('Error handling config component interaction:', error);
                        await componentInteraction.reply({
                            content: '❌ An error occurred while processing your request.',
                            flags: MessageFlags.Ephemeral
                        });
                    }
                });
                
                collector.on('end', () => {
                    const disabledRow1 = new ActionRowBuilder().addComponents(
                        nameSelect.setDisabled(true)
                    );
                    const disabledRow2 = new ActionRowBuilder().addComponents(
                        limitButton.setDisabled(true),
                        bitrateButton.setDisabled(true),
                        deleteButton.setDisabled(true)
                    );
                    
                    message.edit({
                        components: [disabledRow1, disabledRow2],
                        embeds: [{
                            ...responseEmbed,
                            footer: { text: 'Configuration session expired. Run the command again to make changes.' }
                        }]
                    }).catch(() => {});
                });
            }
            
            return await interaction.editReply({ embeds: [responseEmbed] });
            
        } catch (error) {
            logger.error('Error in jointocreate command:', error);
            
            try {
                const errorEmbedObj = errorEmbed("Error", error.message || "An error occurred while executing this command.");
                
                if (interaction.deferred) {
                    return await interaction.editReply({ embeds: [errorEmbedObj] });
                } else {
                    return await interaction.reply({ embeds: [errorEmbedObj], flags: MessageFlags.Ephemeral });
                }
            } catch (replyError) {
                logger.error('Failed to send error message:', replyError);
            }
        }
    },
};

async function handleNameTemplateSelect(interaction, triggerChannel, currentConfig) {
    const selectedTemplate = interaction.values[0];
    
    const channelOptions = currentConfig.channelOptions || {};
    channelOptions[triggerChannel.id] = {
        ...channelOptions[triggerChannel.id],
        nameTemplate: selectedTemplate
    };
    
    await updateJoinToCreateConfig(interaction.client, interaction.guild.id, {
        channelOptions: channelOptions
    });

    await interaction.reply({
        content: `✅ **Name template updated to:** \`${selectedTemplate}\``,
        flags: MessageFlags.Ephemeral
    });
}

async function handleUserLimitModal(interaction, triggerChannel, currentConfig) {
    const modal = new ModalBuilder()
        .setCustomId(`jtc_limit_modal_${triggerChannel.id}`)
        .setTitle('Configure User Limit')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('user_limit')
                    .setLabel('Enter user limit (0-99, 0 = no limit)')
                    .setPlaceholder('Enter a number between 0 and 99')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
                    .setMinLength(1)
                    .setMaxLength(2)
                    .setValue((currentConfig.channelOptions?.[triggerChannel.id]?.userLimit || currentConfig.userLimit || 0).toString())
            )
        );

    await interaction.showModal(modal);

    const filter = (i) => i.customId === `jtc_limit_modal_${triggerChannel.id}` && i.user.id === interaction.user.id;
    try {
        const modalSubmission = await interaction.awaitModalSubmit({ filter, time: 60000 });

        const userInput = modalSubmission.fields.getTextInputValue('user_limit').trim();
        const userLimit = parseInt(userInput);

        if (isNaN(userLimit) || userLimit < 0 || userLimit > 99) {
            await modalSubmission.reply({
                content: '❌ **Invalid input!** Please enter a number between 0 and 99.\n• **0** = No user limit\n• **1-99** = Maximum number of users allowed',
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        const channelOptions = currentConfig.channelOptions || {};
        channelOptions[triggerChannel.id] = {
            ...channelOptions[triggerChannel.id],
            userLimit: userLimit
        };

        await updateJoinToCreateConfig(modalSubmission.client, modalSubmission.guild.id, {
            channelOptions: channelOptions
        });

        await modalSubmission.reply({
            content: `✅ **User limit updated to:** ${userLimit === 0 ? 'No limit' : userLimit + ' users'}`,
            flags: MessageFlags.Ephemeral
        });

    } catch (error) {
        if (error.code === 'INTERACTION_COLLECTOR_ERROR') {
return;
        }
        logger.error('Error handling user limit modal:', error);
    }
}

async function handleBitrateModal(interaction, triggerChannel, currentConfig) {
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
                    .setValue(((currentConfig.channelOptions?.[triggerChannel.id]?.bitrate || currentConfig.bitrate || 64000) / 1000).toString())
            )
        );

    await interaction.showModal(modal);

    const filter = (i) => i.customId === `jtc_bitrate_modal_${triggerChannel.id}` && i.user.id === interaction.user.id;
    try {
        const modalSubmission = await interaction.awaitModalSubmit({ filter, time: 60000 });

        const userInput = modalSubmission.fields.getTextInputValue('bitrate').trim();
        const bitrate = parseInt(userInput);

        if (isNaN(bitrate) || bitrate < 8 || bitrate > 384) {
            await modalSubmission.reply({
                content: '❌ **Invalid input!** Please enter a number between 8 and 384.\n• **8-64 kbps** = Minimum quality\n• **96-128 kbps** = Standard quality\n• **256-384 kbps** = High quality (requires boost level)',
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        const channelOptions = currentConfig.channelOptions || {};
        channelOptions[triggerChannel.id] = {
            ...channelOptions[triggerChannel.id],
            bitrate: bitrate * 1000
        };

        await updateJoinToCreateConfig(modalSubmission.client, modalSubmission.guild.id, {
            channelOptions: channelOptions
        });

        await modalSubmission.reply({
            content: `✅ **Bitrate updated to:** ${bitrate} kbps`,
            flags: MessageFlags.Ephemeral
        });

    } catch (error) {
        if (error.code === 'INTERACTION_COLLECTOR_ERROR') {
return;
        }
        logger.error('Error handling bitrate modal:', error);
    }
}

async function handleChannelDeletion(interaction, triggerChannel, currentConfig, collector) {
    const confirmRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`jtc_delete_confirm`)
            .setLabel('🗑️ Yes, Delete Channel')
            .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
            .setCustomId(`jtc_delete_cancel`)
            .setLabel('❌ Cancel')
            .setStyle(ButtonStyle.Secondary)
    );

    await interaction.reply({
        content: `⚠️ **Are you sure you want to delete ${triggerChannel}?**\n\nThis will remove the Join to Create functionality for this channel and cannot be undone.`,
        components: [confirmRow],
        flags: MessageFlags.Ephemeral
    });

    const message = await interaction.fetchReply();
    const deleteCollector = message.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 30000
    });

    deleteCollector.on('collect', async (deleteInteraction) => {
        if (deleteInteraction.customId === 'jtc_delete_confirm') {
            try {
                const updatedTriggerChannels = currentConfig.triggerChannels.filter(id => id !== triggerChannel.id);
                const updatedChannelOptions = { ...currentConfig.channelOptions };
                delete updatedChannelOptions[triggerChannel.id];
                
                await updateJoinToCreateConfig(deleteInteraction.client, deleteInteraction.guild.id, {
                    triggerChannels: updatedTriggerChannels,
                    channelOptions: updatedChannelOptions
                });

                await triggerChannel.delete('Join to Create channel removed by administrator');

                await deleteInteraction.update({
                    content: `✅ **${triggerChannel.name} has been deleted.**`,
                    components: []
                });

                collector.stop();
            } catch (error) {
                if (error.code === 'INTERACTION_COLLECTOR_ERROR') {
return;
                }
                logger.error('Error handling channel deletion confirmation:', error);
            }
        } else {
            await deleteInteraction.update({
                content: '❌ **Channel deletion cancelled.**',
                components: []
            });
        }
    });

    deleteCollector.on('end', () => {
        interaction.editReply({ components: [] }).catch(() => {});
    });

    deleteCollector.on('error', (error) => {
        if (error.code !== 'INTERACTION_COLLECTOR_ERROR') {
            logger.error('Unexpected error in delete collector:', error);
        }
    });
}





