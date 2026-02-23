import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
export default {
    data: new SlashCommandBuilder()
        .setName("firstmsg")
        .setDescription("Get a link to the first message in this channel")
        .setDMPermission(false)
        .setDefaultMemberPermissions(PermissionFlagsBits.SendMessages),
    category: "Utility",

    async execute(interaction, config, client) {
        try {
            const deferSuccess = await InteractionHelper.safeDefer(interaction);
            if (!deferSuccess) {
                logger.warn(`FirstMsg interaction defer failed`, {
                    userId: interaction.user.id,
                    guildId: interaction.guildId,
                    commandName: 'firstmsg'
                });
                return;
            }

            const messages = await interaction.channel.messages.fetch({
                limit: 1,
                after: '1',
                cache: false
            });
            
            const firstMessage = messages.first();
            
            if (!firstMessage) {
                logger.info(`FirstMsg - no messages found in channel`, {
                    userId: interaction.user.id,
                    channelId: interaction.channelId,
                    guildId: interaction.guildId
                });
                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [successEmbed("First Message", "No messages found in this channel!")],
                });
            }
            
            const messageLink = `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${firstMessage.id}`;
            
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    successEmbed(
                        "First Message in #" + interaction.channel.name,
                        `Message Link: ${messageLink}`
                    ),
                ],
            });

            logger.info(`FirstMsg command executed`, {
                userId: interaction.user.id,
                channelId: interaction.channelId,
                messageId: firstMessage.id,
                guildId: interaction.guildId
            });
        } catch (error) {
            logger.error(`FirstMsg command execution failed`, {
                error: error.message,
                stack: error.stack,
                userId: interaction.user.id,
                channelId: interaction.channelId,
                guildId: interaction.guildId,
                commandName: 'firstmsg'
            });
            await handleInteractionError(interaction, error, {
                commandName: 'firstmsg',
                source: 'firstmsg_command'
            });
        }
    },
};


