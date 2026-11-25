import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, ChannelType } from 'discord.js';
import { successEmbed } from '../../utils/embeds.js';
import { createJoinToCreatePanel } from '../../utils/joinToCreatePanel.js';
import { logger } from '../../utils/logger.js';
import { TitanBotError, ErrorTypes, replyUserError } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import {
    hasManageGuildPermission,
    setPanelImage,
    getPanelImage,
    getConfiguration,
    initializeJoinToCreate,
    removeTriggerChannel
} from '../../services/joinToCreateService.js';

export default {
    data: new SlashCommandBuilder()
        .setName("jointocreate")
        .setDescription("Post the temporary voice control panel.")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .setDMPermission(false)
        .addSubcommand((subcommand) =>
            subcommand
                .setName("panel")
                .setDescription("Post the temporary voice control panel in this channel.")
                .addStringOption((option) =>
                    option
                        .setName("image")
                        .setDescription("Custom image URL for the panel embed (saved for this server).")
                        .setMaxLength(500)
                )
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("setup")
                .setDescription("Set the voice channel that creates a temporary room when joined.")
                .addChannelOption((option) =>
                    option
                        .setName("channel")
                        .setDescription("The voice channel members join to create their own temporary room.")
                        .addChannelTypes(ChannelType.GuildVoice)
                        .setRequired(true)
                )
                .addChannelOption((option) =>
                    option
                        .setName("category")
                        .setDescription("Category the temporary rooms are created under.")
                        .addChannelTypes(ChannelType.GuildCategory)
                        .setRequired(false)
                )
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

            if (subcommand === "panel") {
                await handlePanelSubcommand(interaction, client);
                return;
            }

            if (subcommand === "setup") {
                await handleSetupSubcommand(interaction, client);
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

async function handlePanelSubcommand(interaction, client) {
    const channel = interaction.channel;

    if (!channel?.isTextBased() || typeof channel.send !== 'function') {
        throw new TitanBotError(
            'The current channel cannot receive messages',
            ErrorTypes.VALIDATION,
            'Run this command in a text channel where the bot can send messages.'
        );
    }

    const guildId = interaction.guild.id;
    const imageOption = interaction.options.getString('image');

    if (imageOption) {
        await setPanelImage(client, guildId, imageOption);
    }

    const panelImage = await getPanelImage(client, guildId);

    await channel.send(createJoinToCreatePanel(panelImage));

    return await InteractionHelper.safeEditReply(interaction, {
        embeds: [successEmbed('Panel Posted', imageOption
            ? `The voice control panel was posted in ${channel} using the new image.`
            : `The voice control panel was posted in ${channel}.`)]
    });
}

async function handleSetupSubcommand(interaction, client) {
    const guildId = interaction.guild.id;
    const triggerChannel = interaction.options.getChannel('channel');
    const category = interaction.options.getChannel('category');

    if (!triggerChannel || triggerChannel.type !== ChannelType.GuildVoice) {
        throw new TitanBotError(
            'Selected channel is not a voice channel',
            ErrorTypes.VALIDATION,
            'Please select a voice channel as the Join to Create trigger.'
        );
    }

    const config = await getConfiguration(client, guildId);

    for (const existingChannelId of [...(config.triggerChannels || [])]) {
        await removeTriggerChannel(client, guildId, existingChannelId);
    }

    await initializeJoinToCreate(client, guildId, triggerChannel.id, {
        nameTemplate: '🔊  voice {voiceDisplay}',
        categoryId: category?.id || null
    });

    return await InteractionHelper.safeEditReply(interaction, {
        embeds: [successEmbed('Join to Create Set Up', [
            `Members who join ${triggerChannel} will now get their own temporary voice room.`,
            category ? `New rooms are created under **${category.name}**.` : null
        ].filter(Boolean).join('\n'))]
    });
}
