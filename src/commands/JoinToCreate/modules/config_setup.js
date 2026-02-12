import { 
    ActionRowBuilder, 
    StringSelectMenuBuilder, 
    StringSelectMenuOptionBuilder, 
    ChannelType,
    MessageFlags,
    ComponentType,
    EmbedBuilder,
    ButtonBuilder,
    ButtonStyle
} from 'discord.js';
import { successEmbed, errorEmbed } from '../../../utils/embeds.js';
import { 
    getJoinToCreateConfig, 
    updateJoinToCreateConfig,
    removeJoinToCreateTrigger,
    addJoinToCreateTrigger
} from '../../../utils/database.js';

export default {
    async execute(interaction, config, client) {
        try {
            const triggerChannel = interaction.options.getChannel('trigger_channel');
        const guildId = interaction.guild.id;

        const currentConfig = await getJoinToCreateConfig(client, guildId);

        if (!currentConfig.triggerChannels.includes(triggerChannel.id)) {
            throw new Error(`${triggerChannel} is not configured as a Join to Create trigger channel.`);
        }

        const embed = new EmbedBuilder()
            .setTitle('âš™ï¸ Join to Create Configuration')
            .setDescription(`Configure settings for ${triggerChannel}`)
            .setColor('#0099ff')
            .addFields(
                {
                    name: 'ðŸ“ Current Channel Name Template',
                    value: `\`${currentConfig.channelOptions?.[triggerChannel.id]?.nameTemplate || currentConfig.channelNameTemplate}\``,
                    inline: false
                },
                {
                    name: 'ðŸ‘¥ Current User Limit',
                    value: `${currentConfig.channelOptions?.[triggerChannel.id]?.userLimit || currentConfig.userLimit === 0 ? 'No limit' : currentConfig.userLimit + ' users'}`,
                    inline: true
                },
                {
                    name: 'ðŸŽµ Current Bitrate',
                    value: `${(currentConfig.channelOptions?.[triggerChannel.id]?.bitrate || currentConfig.bitrate) / 1000} kbps`,
                    inline: true
                }
            )
            .setFooter({ text: 'Select an option to configure below' })
            .setTimestamp();

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`jointocreate_config_${triggerChannel.id}`)
            .setPlaceholder('Select a configuration option')
            .addOptions(
                new StringSelectMenuOptionBuilder()
                    .setLabel('Change Channel Name Template')
                    .setDescription('Modify the template for temporary channel names')
                    .setValue('name_template'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('Change User Limit')
                    .setDescription('Set maximum users per temporary channel')
                    .setValue('user_limit'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('Change Bitrate')
                    .setDescription('Adjust audio quality for temporary channels')
                    .setValue('bitrate'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('Remove This Trigger Channel')
                    .setDescription('Remove this channel from the Join to Create system')
                    .setValue('remove_trigger'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('View Current Settings')
                    .setDescription('Show all current configuration details')
                    .setValue('view_settings')
            );

        const row = new ActionRowBuilder().addComponents(selectMenu);

        await interaction.editReply({
            embeds: [embed],
            components: [row],
        }).catch(error => {
            console.error('Failed to edit reply in config_setup:', error);
        });

        const collector = interaction.channel.createMessageComponentCollector({
            componentType: ComponentType.StringSelect,
            filter: (i) => i.user.id === interaction.user.id && i.customId === `jointocreate_config_${triggerChannel.id}`,
time: 60000
        });

        collector.on('collect', async (selectInteraction) => {
            await selectInteraction.deferUpdate();

            const selectedOption = selectInteraction.values[0];

            try {
                switch (selectedOption) {
                    case 'name_template':
                        await handleNameTemplateChange(selectInteraction, triggerChannel, currentConfig, client);
                        break;
                    case 'user_limit':
                        await handleUserLimitChange(selectInteraction, triggerChannel, currentConfig, client);
                        break;
                    case 'bitrate':
                        await handleBitrateChange(selectInteraction, triggerChannel, currentConfig, client);
                        break;
                    case 'remove_trigger':
                        await handleRemoveTrigger(selectInteraction, triggerChannel, currentConfig, client);
                        break;
                    case 'view_settings':
                        await handleViewSettings(selectInteraction, triggerChannel, currentConfig, client);
                        break;
                }
            } catch (error) {
                console.error('Configuration menu error:', error);
                await selectInteraction.followUp({
                    embeds: [errorEmbed('Configuration Error', 'An error occurred while processing your selection.')],
                    flags: MessageFlags.Ephemeral,
                });
            }
        });

        collector.on('end', async (collected, reason) => {
            if (reason === 'time') {
                const disabledRow = new ActionRowBuilder().addComponents(
                    selectMenu.setDisabled(true)
                );
                
                await interaction.editReply({
                    components: [disabledRow],
                }).catch(() => {});
            }
        });
            } catch (error) {
            console.error('Error in config_setup:', error);
            throw new Error(`Failed to configure Join to Create: ${error.message}`);
        }
    }
};

async function handleNameTemplateChange(interaction, triggerChannel, currentConfig, client) {
    const embed = new EmbedBuilder()
        .setTitle('ðŸ“ Channel Name Template Configuration')
        .setDescription('Please enter the new channel name template.')
        .addFields(
            {
                name: 'Available Variables',
                value: 'â€¢ `{username}` - User\'s username\nâ€¢ `{display_name}` - User\'s display name\nâ€¢ `{user_tag}` - User\'s tag (User#1234)\nâ€¢ `{guild_name}` - Server name',
                inline: false
            },
            {
                name: 'Current Template',
                value: `\`${currentConfig.channelOptions?.[triggerChannel.id]?.nameTemplate || currentConfig.channelNameTemplate}\``,
                inline: false
            }
        )
        .setColor('#0099ff')
        .setFooter({ text: 'Type your new template in the chat below' });

    await interaction.followUp({ embeds: [embed], flags: MessageFlags.Ephemeral });

    const collector = interaction.channel.createMessageCollector({
        filter: (m) => m.author.id === interaction.user.id,
time: 30000,
        max: 1
    });

    collector.on('collect', async (message) => {
        try {
            const newTemplate = message.content.trim();
            
            if (!newTemplate || newTemplate.length > 100) {
                await interaction.followUp({
                    embeds: [errorEmbed('Invalid Template', 'Template must be between 1 and 100 characters.')],
                    flags: MessageFlags.Ephemeral,
                });
                return;
            }

            const channelOptions = currentConfig.channelOptions || {};
            channelOptions[triggerChannel.id] = {
                ...channelOptions[triggerChannel.id],
                nameTemplate: newTemplate
            };

            await updateJoinToCreateConfig(client, interaction.guild.id, {
                channelOptions: channelOptions
            });

            await interaction.followUp({
                embeds: [successEmbed('âœ… Template Updated', `Channel name template changed to \`${newTemplate}\``)],
                flags: MessageFlags.Ephemeral,
            });

            await message.delete().catch(() => {});
        } catch (error) {
            console.error('Template update error:', error);
            await interaction.followUp({
                embeds: [errorEmbed('Update Failed', 'Could not update the channel name template.')],
                flags: MessageFlags.Ephemeral,
            });
        }
    });

    collector.on('end', (collected, reason) => {
        if (reason === 'time') {
            interaction.followUp({
                embeds: [errorEmbed('Timeout', 'No response received. Template update cancelled.')],
                flags: MessageFlags.Ephemeral,
            }).catch(() => {});
        }
    });
}

async function handleUserLimitChange(interaction, triggerChannel, currentConfig, client) {
    const embed = new EmbedBuilder()
        .setTitle('ðŸ‘¥ User Limit Configuration')
        .setDescription('Please enter the new user limit (0-99, where 0 = no limit).')
        .addFields(
            {
                name: 'Current Limit',
                value: `${currentConfig.channelOptions?.[triggerChannel.id]?.userLimit || currentConfig.userLimit === 0 ? 'No limit' : currentConfig.userLimit + ' users'}`,
                inline: false
            }
        )
        .setColor('#0099ff')
        .setFooter({ text: 'Type the new limit in the chat below' });

    await interaction.followUp({ embeds: [embed], flags: MessageFlags.Ephemeral });

    const collector = interaction.channel.createMessageCollector({
        filter: (m) => m.author.id === interaction.user.id && /^\d+$/.test(m.content.trim()),
        time: 30000,
        max: 1
    });

    collector.on('collect', async (message) => {
        try {
            const newLimit = parseInt(message.content.trim());
            
            if (newLimit < 0 || newLimit > 99) {
                await interaction.followUp({
                    embeds: [errorEmbed('Invalid Limit', 'User limit must be between 0 and 99.')],
                    flags: MessageFlags.Ephemeral,
                });
                return;
            }

            const channelOptions = currentConfig.channelOptions || {};
            channelOptions[triggerChannel.id] = {
                ...channelOptions[triggerChannel.id],
                userLimit: newLimit
            };

            await updateJoinToCreateConfig(client, interaction.guild.id, {
                channelOptions: channelOptions
            });

            await interaction.followUp({
                embeds: [successEmbed('âœ… Limit Updated', `User limit changed to ${newLimit === 0 ? 'No limit' : newLimit + ' users'}`)],
                flags: MessageFlags.Ephemeral,
            });

            await message.delete().catch(() => {});
        } catch (error) {
            console.error('User limit update error:', error);
            await interaction.followUp({
                embeds: [errorEmbed('Update Failed', 'Could not update the user limit.')],
                flags: MessageFlags.Ephemeral,
            });
        }
    });

    collector.on('end', (collected, reason) => {
        if (reason === 'time') {
            interaction.followUp({
                embeds: [errorEmbed('Timeout', 'No valid response received. Update cancelled.')],
                flags: MessageFlags.Ephemeral,
            }).catch(() => {});
        }
    });
}

async function handleBitrateChange(interaction, triggerChannel, currentConfig, client) {
    const embed = new EmbedBuilder()
        .setTitle('ðŸŽµ Bitrate Configuration')
        .setDescription('Please enter the new bitrate in kbps (8-384).')
        .addFields(
            {
                name: 'Current Bitrate',
                value: `${(currentConfig.channelOptions?.[triggerChannel.id]?.bitrate || currentConfig.bitrate) / 1000} kbps`,
                inline: false
            },
            {
                name: 'Common Values',
                value: 'â€¢ 64 kbps - Normal quality\nâ€¢ 96 kbps - Good quality\nâ€¢ 128 kbps - High quality\nâ€¢ 256 kbps - Very high quality',
                inline: false
            }
        )
        .setColor('#0099ff')
        .setFooter({ text: 'Type the new bitrate in the chat below' });

    await interaction.followUp({ embeds: [embed], flags: MessageFlags.Ephemeral });

    const collector = interaction.channel.createMessageCollector({
        filter: (m) => m.author.id === interaction.user.id && /^\d+$/.test(m.content.trim()),
        time: 30000,
        max: 1
    });

    collector.on('collect', async (message) => {
        try {
            const newBitrate = parseInt(message.content.trim());
            
            if (newBitrate < 8 || newBitrate > 384) {
                await interaction.followUp({
                    embeds: [errorEmbed('Invalid Bitrate', 'Bitrate must be between 8 and 384 kbps.')],
                    flags: MessageFlags.Ephemeral,
                });
                return;
            }

            const channelOptions = currentConfig.channelOptions || {};
            channelOptions[triggerChannel.id] = {
                ...channelOptions[triggerChannel.id],
                bitrate: newBitrate * 1000
            };

            await updateJoinToCreateConfig(client, interaction.guild.id, {
                channelOptions: channelOptions
            });

            await interaction.followUp({
                embeds: [successEmbed('âœ… Bitrate Updated', `Bitrate changed to ${newBitrate} kbps`)],
                flags: MessageFlags.Ephemeral,
            });

            await message.delete().catch(() => {});
        } catch (error) {
            console.error('Bitrate update error:', error);
            await interaction.followUp({
                embeds: [errorEmbed('Update Failed', 'Could not update the bitrate.')],
                flags: MessageFlags.Ephemeral,
            });
        }
    });

    collector.on('end', (collected, reason) => {
        if (reason === 'time') {
            interaction.followUp({
                embeds: [errorEmbed('Timeout', 'No valid response received. Update cancelled.')],
                flags: MessageFlags.Ephemeral,
            }).catch(() => {});
        }
    });
}

async function handleRemoveTrigger(interaction, triggerChannel, currentConfig, client) {
    const embed = new EmbedBuilder()
        .setTitle('âš ï¸ Remove Trigger Channel')
        .setDescription(`Are you sure you want to remove ${triggerChannel} from the Join to Create system?`)
        .setColor('#ff6600')
        .setFooter({ text: 'This action cannot be undone' });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`confirm_remove_${triggerChannel.id}`)
            .setLabel('Remove Channel')
            .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
            .setCustomId(`cancel_remove_${triggerChannel.id}`)
            .setLabel('Cancel')
            .setStyle(ButtonStyle.Secondary)
    );

    await interaction.followUp({ 
        embeds: [embed], 
        components: [row],
        flags: MessageFlags.Ephemeral 
    });

    const collector = interaction.channel.createMessageComponentCollector({
        componentType: ComponentType.Button,
        filter: (i) => i.user.id === interaction.user.id && 
                     (i.customId === `confirm_remove_${triggerChannel.id}` || i.customId === `cancel_remove_${triggerChannel.id}`),
        time: 30000,
        max: 1
    });

    collector.on('collect', async (buttonInteraction) => {
        await buttonInteraction.deferUpdate();

        if (buttonInteraction.customId === `confirm_remove_${triggerChannel.id}`) {
            try {
                const success = await removeJoinToCreateTrigger(client, interaction.guild.id, triggerChannel.id);
                
                if (success) {
                    await buttonInteraction.followUp({
                        embeds: [successEmbed('âœ… Channel Removed', `${triggerChannel} has been removed from the Join to Create system.`)],
                        flags: MessageFlags.Ephemeral,
                    });
                } else {
                    await buttonInteraction.followUp({
                        embeds: [errorEmbed('Removal Failed', 'Could not remove the trigger channel.')],
                        flags: MessageFlags.Ephemeral,
                    });
                }
            } catch (error) {
                console.error('Remove trigger error:', error);
                await buttonInteraction.followUp({
                    embeds: [errorEmbed('Removal Failed', 'An error occurred while removing the trigger channel.')],
                    flags: MessageFlags.Ephemeral,
                });
            }
        } else {
            await buttonInteraction.followUp({
                embeds: [successEmbed('âœ… Cancelled', 'Channel removal has been cancelled.')],
                flags: MessageFlags.Ephemeral,
            });
        }
    });

    collector.on('end', (collected, reason) => {
        if (reason === 'time') {
            interaction.followUp({
                embeds: [errorEmbed('Timeout', 'No response received. Removal cancelled.')],
                flags: MessageFlags.Ephemeral,
            }).catch(() => {});
        }
    });
}

async function handleViewSettings(interaction, triggerChannel, currentConfig, client) {
    const channelConfig = currentConfig.channelOptions?.[triggerChannel.id] || {};
    
    const embed = new EmbedBuilder()
        .setTitle('ðŸ“‹ Current Settings')
        .setDescription(`Configuration for ${triggerChannel}`)
        .setColor('#0099ff')
        .addFields(
            {
                name: 'ðŸŽ¯ Trigger Channel',
                value: `${triggerChannel} (${triggerChannel.id})`,
                inline: false
            },
            {
                name: 'ðŸ“ Channel Name Template',
                value: `\`${channelConfig.nameTemplate || currentConfig.channelNameTemplate}\``,
                inline: false
            },
            {
                name: 'ðŸ‘¥ User Limit',
                value: `${channelConfig.userLimit || currentConfig.userLimit === 0 ? 'No limit' : (channelConfig.userLimit || currentConfig.userLimit) + ' users'}`,
                inline: true
            },
            {
                name: 'ðŸŽµ Bitrate',
                value: `${(channelConfig.bitrate || currentConfig.bitrate) / 1000} kbps`,
                inline: true
            },
            {
                name: 'ðŸ“ Category',
                value: currentConfig.categoryId ? `<#${currentConfig.categoryId}>` : 'Not set',
                inline: true
            },
            {
                name: 'ðŸ“Š System Status',
                value: currentConfig.enabled ? 'âœ… Enabled' : 'âŒ Disabled',
                inline: true
            },
            {
                name: 'ðŸ”¢ Active Temporary Channels',
                value: Object.keys(currentConfig.temporaryChannels || {}).length.toString(),
                inline: true
            }
        )
        .setTimestamp();

    await interaction.followUp({ 
        embeds: [embed], 
        flags: MessageFlags.Ephemeral 
    });
}

