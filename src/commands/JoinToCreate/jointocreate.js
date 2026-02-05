import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, ChannelType } from 'discord.js';
import { errorEmbed, successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { addJoinToCreateTrigger, getJoinToCreateConfig } from '../../utils/database.js';

// NOTE: We've removed the setup and configSetup module imports 
// and incorporated their functionality directly in this file
// to prevent multiple channel creation and interaction issues

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
                        .setDescription("Template for naming temporary voice channels. (ex: {username}'s Room)")
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
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("cleanup")
                .setDescription("Clean up duplicate Join to Create channels.")
                .addBooleanOption((option) =>
                    option
                        .setName("keep_newest")
                        .setDescription("Keep the newest channel instead of the oldest one.")
                )
        ),
    category: "utility",

    async execute(interaction, config, client) {
        try {
            // Get the subcommand first
            const subcommand = interaction.options.getSubcommand();
            
            // Immediately get all needed options before any async operations
            let responseEmbed;
            
            // Handle setup subcommand
            if (subcommand === "setup") {
                // Get all options upfront
                const category = interaction.options.getChannel('category');
                const nameTemplate = interaction.options.getString('channel_name') || "{username}'s Room";
                const userLimit = interaction.options.getInteger('user_limit') || 0;
                const bitrate = interaction.options.getInteger('bitrate') || 64;
                const guildId = interaction.guild.id;
                
                // NOW defer
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });
                
                // Check if a Join to Create channel already exists
                const existingChannels = await interaction.guild.channels.fetch();
                const existingJoinToCreate = existingChannels.filter(c => 
                    c.type === ChannelType.GuildVoice && 
                    c.name === 'Join to Create'
                );
                
                if (existingJoinToCreate.size > 0) {
                    // Use the first existing channel
                    const triggerChannel = existingJoinToCreate.first();
                    
                    // Update database with new settings
                    await addJoinToCreateTrigger(client, guildId, triggerChannel.id, {
                        nameTemplate: nameTemplate,
                        userLimit: userLimit,
                        bitrate: bitrate * 1000,
                        categoryId: category?.id
                    });
                    
                    // Create success message
                    responseEmbed = successEmbed(
                        `Updated existing Join to Create channel: ${triggerChannel}\n\n` +
                        `**New Settings:**\n` +
                        `• Template: \`${nameTemplate}\`\n` +
                        `• User Limit: ${userLimit === 0 ? 'None' : userLimit}\n` +
                        `• Bitrate: ${bitrate} kbps`,
                        '✅ Settings Updated'
                    );
                } else {
                    // Create a new trigger channel
                    const triggerChannel = await interaction.guild.channels.create({
                        name: 'Join to Create',
                        type: ChannelType.GuildVoice,
                        parent: category?.id,
                        userLimit: userLimit,
                        bitrate: bitrate * 1000,
                        permissionOverwrites: [
                            {
                                id: interaction.guild.id,
                                allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect],
                            },
                        ],
                    });
                    
                    // Add to database
                    await addJoinToCreateTrigger(client, guildId, triggerChannel.id, {
                        nameTemplate: nameTemplate,
                        userLimit: userLimit,
                        bitrate: bitrate * 1000,
                        categoryId: category?.id
                    });
                    
                    // Create success message
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
            
            // Handle config subcommand
            else if (subcommand === "config") {
                // Get trigger channel
                const triggerChannel = interaction.options.getChannel('trigger_channel');
                
                // NOW defer
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });
                
                // Get current config
                const currentConfig = await getJoinToCreateConfig(client, interaction.guild.id);
                
                // Check if valid trigger channel
                if (!currentConfig.triggerChannels.includes(triggerChannel.id)) {
                    throw new Error(`${triggerChannel} is not configured as a Join to Create trigger channel.`);
                }
                
                // Get channel-specific config
                const channelConfig = currentConfig.channelOptions?.[triggerChannel.id] || {};
                
                responseEmbed = {
                    title: '⚙️ Join to Create Configuration',
                    description: `Current settings for ${triggerChannel}`,
                    color: 0x0099ff,
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
                    footer: { text: 'To change these settings, use the future update options' },
                    timestamp: new Date()
                };
            }
            
            // Handle cleanup subcommand
            else if (subcommand === "cleanup") {
                // Get option
                const keepNewest = interaction.options.getBoolean('keep_newest') || false;
                
                // Defer the reply
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });
                
                // Fetch all channels
                const existingChannels = await interaction.guild.channels.fetch();
                
                // Filter to find Join to Create channels
                const joinToCreateChannels = existingChannels.filter(c => 
                    c.type === ChannelType.GuildVoice && 
                    c.name === 'Join to Create'
                );
                
                // If we have more than one channel, clean up duplicates
                if (joinToCreateChannels.size <= 1) {
                    responseEmbed = {
                        title: 'No Duplicates Found',
                        description: 'There are no duplicate Join to Create channels to clean up.',
                        color: 0x0099ff
                    };
                } else {
                    // Sort channels by creation date
                    const sortedChannels = [...joinToCreateChannels.values()]
                        .sort((a, b) => a.createdTimestamp - b.createdTimestamp);
                    
                    // Select the channel to keep
                    const keepChannel = keepNewest ? sortedChannels[sortedChannels.length - 1] : sortedChannels[0];
                    
                    // Delete the others
                    let deletedCount = 0;
                    for (const channel of sortedChannels) {
                        if (channel.id !== keepChannel.id) {
                            try {
                                await channel.delete('Cleanup of duplicate Join to Create channels');
                                deletedCount++;
                            } catch (error) {
                                logger.error(`Failed to delete channel ${channel.name} (${channel.id}):`, error);
                            }
                        }
                    }
                    
                    responseEmbed = successEmbed(
                        `Cleaned up duplicate Join to Create channels\n\n` +
                        `**Results:**\n` +
                        `• Deleted: ${deletedCount} duplicate channel(s)\n` +
                        `• Kept: ${keepChannel}\n` +
                        `• Strategy: Keeping ${keepNewest ? 'newest' : 'oldest'} channel`,
                        '✅ Cleanup Complete'
                    );
                    
                    // Update database to ensure only the kept channel is registered
                    // (This assumes we have current configuration with some basic options)
                    try {
                        const currentConfig = await getJoinToCreateConfig(client, interaction.guild.id);
                        const guildId = interaction.guild.id;
                        
                        // Extract best settings from any existing channel
                        let bestConfig = {};
                        for (const channelId of currentConfig.triggerChannels) {
                            if (currentConfig.channelOptions?.[channelId]) {
                                bestConfig = currentConfig.channelOptions[channelId];
                                break;
                            }
                        }
                        
                        // Re-register the kept channel with best settings
                        await addJoinToCreateTrigger(client, guildId, keepChannel.id, {
                            nameTemplate: bestConfig.nameTemplate || "{username}'s Room",
                            userLimit: bestConfig.userLimit || 0,
                            bitrate: bestConfig.bitrate || 64000,
                            categoryId: bestConfig.categoryId || null
                        });
                    } catch (error) {
                        logger.error('Failed to update database during cleanup:', error);
                    }
                }
            }
            
            return await interaction.editReply({ embeds: [responseEmbed] });
            
        } catch (error) {
            logger.error('Error in jointocreate command:', error);
            
            try {
                // Create error embed
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
