import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { successEmbed } from '../../utils/embeds.js';
import { createJoinToCreatePanel } from '../../utils/joinToCreatePanel.js';
import { logger } from '../../utils/logger.js';
import { TitanBotError, ErrorTypes, replyUserError } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import {
    hasManageGuildPermission,
    setPanelImage,
    getPanelImage
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
