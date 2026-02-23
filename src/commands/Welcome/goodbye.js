import { getColor } from '../../config/bot.js';
import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, EmbedBuilder, MessageFlags } from 'discord.js';
import { createEmbed, errorEmbed } from '../../utils/embeds.js';
import { getWelcomeConfig, updateWelcomeConfig } from '../../utils/database.js';
import { formatWelcomeMessage } from '../../utils/welcome.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

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
        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) {
            logger.warn(`Goodbye interaction defer failed`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'goodbye'
            });
            return;
        }

        const { options, guild, client } = interaction;
        const subcommand = options.getSubcommand();

        if (subcommand === 'setup') {
            const channel = options.getChannel('channel');
            const message = options.getString('message');
            const image = options.getString('image');

            
            if (!message || message.trim().length === 0) {
                logger.warn(`[Goodbye] Empty message provided by ${interaction.user.tag} in ${guild.name}`);
                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed('Invalid Input', 'Goodbye message cannot be empty')],
                    flags: MessageFlags.Ephemeral
                });
            }

            
            if (image) {
                try {
                    new URL(image);
                } catch (e) {
                    logger.warn(`[Goodbye] Invalid image URL provided by ${interaction.user.tag}: ${image}`);
                    return await InteractionHelper.safeEditReply(interaction, {
                        embeds: [errorEmbed('Invalid Image URL', 'Please provide a valid image URL (must start with http:// or https://')],
                        flags: MessageFlags.Ephemeral
                    });
                }
            }

            try {
                await updateWelcomeConfig(client, guild.id, {
                    goodbyeEnabled: true,
                    goodbyeChannelId: channel.id,
                    leaveMessage: message,
                    leaveEmbed: {
                        title: "Goodbye {user.tag}",
                        description: message,
                        color: getColor('error'),
                        footer: `Goodbye from ${guild.name}!`,
                        ...(image && { image: { url: image } })
                    }
                });

                logger.info(`[Goodbye] Setup configured by ${interaction.user.tag} for guild ${guild.name} (${guild.id})`);

                const previewMessage = formatWelcomeMessage(message, {
                    user: interaction.user,
                    guild
                });

                const embed = new EmbedBuilder()
                    .setColor(getColor('success'))
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

                await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
            } catch (error) {
                logger.error(`[Goodbye] Failed to setup goodbye system for guild ${guild.id}:`, error);
                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed(
                        'Setup Failed',
                        'An error occurred while configuring the goodbye system. Please try again.',
                        { showDetails: true }
                    )],
                    flags: MessageFlags.Ephemeral
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

                logger.info(`[Goodbye] Toggled to ${newStatus ? 'enabled' : 'disabled'} by ${interaction.user.tag} in guild ${guild.name} (${guild.id})`);
                await InteractionHelper.safeEditReply(interaction, {
                    content: `✅ Goodbye messages have been ${newStatus ? 'enabled' : 'disabled'}.`,
                    flags: MessageFlags.Ephemeral
                });
            } catch (error) {
                logger.error(`[Goodbye] Failed to toggle goodbye system for guild ${guild.id}:`, error);
                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed(
                        'Toggle Failed',
                        'An error occurred while toggling goodbye messages. Please try again.',
                        { showDetails: true }
                    )],
                    flags: MessageFlags.Ephemeral
                });
            }
        }
    },
};



