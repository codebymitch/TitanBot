import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType, EmbedBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';
import { getWelcomeConfig, updateWelcomeConfig } from '../../utils/database.js';

export default {
    data: new SlashCommandBuilder()
        .setName('goodbye')
        .setDescription('Configure the goodbye message system')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(subcommand =>
            subcommand
                .setName('setup')
                .setDescription('Set up the goodbye message')
                .addChannelOption(option =>
                    option.setName('channel')
                        .setDescription('The channel to send goodbye messages to')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('message')
                        .setDescription('Goodbye message. Variables: {user}, {username}, {server}, {memberCount}')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('image')
                        .setDescription('URL of the image to include in the goodbye message')
                        .setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('toggle')
                .setDescription('Enable or disable goodbye messages')),

    async execute(interaction) {
const { options, guild, client } = interaction;
        const subcommand = options.getSubcommand();

        if (subcommand === 'setup') {
            const channel = options.getChannel('channel');
            const message = options.getString('message');
            const image = options.getString('image');

            try {
                await updateWelcomeConfig(client, guild.id, {
                    goodbyeEnabled: true,
                    goodbyeChannelId: channel.id,
                    leaveMessage: message,
                    leaveEmbed: {
                        title: "Goodbye {user.tag}",
                        description: message,
color: 0xff0000,
                        ...(image && { image: { url: image } })
                    }
                });

                const previewMessage = message
                    .replace(/{user}/g, interaction.user.tag)
                    .replace(/{username}/g, interaction.user.username)
                    .replace(/{server}/g, guild.name)
                    .replace(/{memberCount}/g, guild.memberCount.toLocaleString());

                const embed = new EmbedBuilder()
.setColor(0x00ff00)
                    .setTitle('✅ Goodbye System Configured')
                    .setDescription(`Goodbye messages will now be sent to ${channel}`)
                    .addFields(
                        { name: 'Message Preview', value: previewMessage },
                        { name: 'Status', value: '✅ Enabled' }
                    )
                    .setFooter({ text: 'Tip: Use /goodbye toggle to enable/disable goodbye messages' });

                if (image) {
                    embed.setImage(image);
                }

                await interaction.editReply({ embeds: [embed] });
            } catch (error) {
                await interaction.editReply({ 
                    content: '❌ An error occurred while setting up the goodbye system.', 
                    flags: ["Ephemeral"] 
                });
            }
        } 
        
        else if (subcommand === 'toggle') {
            try {
                const currentConfig = await getWelcomeConfig(client, guild.id);
                const newStatus = !currentConfig.goodbyeEnabled;
                
                await updateWelcomeConfig(client, guild.id, {
                    goodbyeEnabled: newStatus
                });

                await interaction.editReply({
                    content: `✅ Goodbye messages have been ${newStatus ? 'enabled' : 'disabled'}.`,
                    flags: ["Ephemeral"]
                });
            } catch (error) {
                await interaction.editReply({ 
                    content: '❌ An error occurred while toggling goodbye messages.', 
                    flags: ["Ephemeral"] 
                });
            }
        }
    },
};
