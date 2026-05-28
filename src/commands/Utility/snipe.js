import { SlashCommandBuilder, ChannelType } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getFromDb, setInDb } from '../../utils/database.js';

export default {
    data: new SlashCommandBuilder()
        .setName("snipe")
        .setDescription("Get the last deleted message in this channel")
        .addIntegerOption((option) =>
            option
                .setName("index")
                .setDescription("Which deleted message to retrieve (1 = most recent)")
                .setRequired(false)
        ),
    category: "utility",

    async execute(interaction) {
        try {
            const deferSuccess = await InteractionHelper.safeDefer(interaction);
            if (!deferSuccess) {
                logger.warn(`Snipe interaction defer failed`, {
                    userId: interaction.user.id,
                    guildId: interaction.guildId,
                    channelId: interaction.channelId
                });
                return;
            }

            const index = interaction.options.getInteger("index") || 1;
            const channelId = interaction.channelId;
            const snipeKey = `snipe:${interaction.guildId}:${channelId}`;

            // Get sniped messages list
            const snipedMessages = (await getFromDb(snipeKey, [])) || [];

            if (snipedMessages.length === 0) {
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed("Nothing to Snipe", "There are no deleted messages in this channel.")],
                });
            }

            if (index < 1 || index > snipedMessages.length) {
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [
                        errorEmbed(
                            "Invalid Index",
                            `Please provide an index between 1 and ${snipedMessages.length}.`
                        ),
                    ],
                });
            }

            const message = snipedMessages[index - 1];
            const timestamp = Math.floor(message.timestamp / 1000);

            const embed = createEmbed({
                title: `Sniped Message`,
                description: message.content || "(No content)",
                color: "blurple",
                timestamp: new Date(message.timestamp),
            })
                .addFields({
                    name: "Author",
                    value: `${message.author || "Unknown"}`,
                    inline: true,
                })
                .addFields({
                    name: "Deleted",
                    value: `<t:${timestamp}:R>`,
                    inline: true,
                });

            if (message.attachments && message.attachments.length > 0) {
                embed.addFields({
                    name: "Attachments",
                    value: message.attachments.join("\n"),
                    inline: false,
                });
            }

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });

            logger.info(`User sniped message`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                channelId,
                index,
            });
        } catch (error) {
            logger.error("Snipe command error:", error);
            await handleInteractionError(interaction, error, { subtype: "snipe_failed" });
        }
    }
};
