import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';

// Migrated from: commands/Welcome/goodbye.js
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
                // Update the goodbye configuration
                await updateWelcomeConfig(client, guild.id, {
                    goodbyeEnabled: true,
                    goodbyeChannel: channel.id,
                    goodbyeMessage: message,
                    goodbyeImage: image || undefined
                });

                // Create a preview of the goodbye message
                const previewMessage = message
                    .replace(/{user}/g, interaction.user.tag)
                    .replace(/{username}/g, interaction.user.username)
                    .replace(/{server}/g, guild.name)
                    .replace(/{memberCount}/g, guild.memberCount.toLocaleString());

                const embed = new EmbedBuilder()
                    .setColor(client.config.embeds.colors.success)
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

                await interaction.reply({ embeds: [embed] });
            } catch (error) {
                console.error('Error setting up goodbye system:', error);
                await interaction.reply({ 
                    content: '❌ An error occurred while setting up the goodbye system.', 
                    ephemeral: true 
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

                await interaction.reply({
                    content: `✅ Goodbye messages have been ${newStatus ? 'enabled' : 'disabled'}.`,
                    ephemeral: true
                });
            } catch (error) {
                console.error('Error toggling goodbye messages:', error);
                await interaction.reply({ 
                    content: '❌ An error occurred while toggling goodbye messages.', 
                    ephemeral: true 
                });
            }
        }
    },
};
