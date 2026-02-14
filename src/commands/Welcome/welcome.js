import { getColor } from '../../config/bot.js';
﻿import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, EmbedBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';
import { getWelcomeConfig, updateWelcomeConfig } from '../../utils/database.js';

export default {
    data: new SlashCommandBuilder()
        .setName('welcome')
        .setDescription('Configure the welcome system')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(subcommand =>
            subcommand
                .setName('setup')
                .setDescription('Set up the welcome message')
                .addChannelOption(option =>
                    option.setName('channel')
                        .setDescription('The channel to send welcome messages to')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('message')
                        .setDescription('Welcome message. Variables: {user}, {username}, {server}, {memberCount}')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('image')
                        .setDescription('URL of the image to include in the welcome message')
                        .setRequired(false))
                .addBooleanOption(option =>
                    option.setName('ping')
                        .setDescription('Whether to ping the user in the welcome message')
                        .setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('toggle')
                .setDescription('Enable or disable welcome messages')),

    async execute(interaction) {
const { options, guild, client } = interaction;
        const subcommand = options.getSubcommand();

        if (subcommand === 'setup') {
            const channel = options.getChannel('channel');
            const message = options.getString('message');
            const image = options.getString('image');
            const ping = options.getBoolean('ping') ?? false;

            try {
                const newConfig = await updateWelcomeConfig(client, guild.id, {
                    enabled: true,
                    channelId: channel.id,
                    welcomeMessage: message,
                    welcomeImage: image || undefined,
                    welcomePing: ping
                });

                const previewMessage = message
                    .replace(/{user}/g, interaction.user.toString())
                    .replace(/{username}/g, interaction.user.username)
                    .replace(/{server}/g, guild.name)
                    .replace(/{memberCount}/g, guild.memberCount.toLocaleString());

                const embed = new EmbedBuilder()
.setColor(getColor('success'))
                    .setTitle('✅ Welcome System Configured')
                    .setDescription(`Welcome messages will now be sent to ${channel}`)
                    .addFields(
                        { name: 'Message Preview', value: previewMessage },
                        { name: 'Ping User', value: ping ? '✅ Yes' : '❌ No' },
                        { name: 'Status', value: '✅ Enabled' }
                    )
                    .setFooter({ text: 'Tip: Use /welcome toggle to enable/disable welcome messages' });

                if (image) {
                    embed.setImage(image);
                }

                await interaction.editReply({ embeds: [embed] });
            } catch (error) {
                await interaction.editReply({ 
                    content: '❌ An error occurred while setting up the welcome system.', 
                    flags: ["Ephemeral"] 
                });
            }
        } 
        
        else if (subcommand === 'toggle') {
            try {
                const currentConfig = await getWelcomeConfig(client, guild.id);
                const newStatus = !currentConfig.enabled;
                
                await updateWelcomeConfig(client, guild.id, {
                    enabled: newStatus
                });

                await interaction.editReply({
                    content: `✅ Welcome messages have been ${newStatus ? 'enabled' : 'disabled'}.`,
                    flags: ["Ephemeral"]
                });
            } catch (error) {
                await interaction.editReply({ 
                    content: '❌ An error occurred while toggling welcome messages.', 
                    flags: ["Ephemeral"] 
                });
            }
        }
    },
};



