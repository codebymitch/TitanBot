import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { errorEmbed, successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { TitanBotError, ErrorTypes, handleInteractionError } from '../../utils/errorHandler.js';
import { getGuildGiveaways, saveGiveaway } from '../../utils/giveaways.js';
import { 
    endGiveaway as endGiveawayService,
    createGiveawayEmbed, 
    createGiveawayButtons 
} from '../../services/giveawayService.js';
import { logEvent, EVENT_TYPES } from '../../services/loggingService.js';

export default {
    data: new SlashCommandBuilder()
        .setName("gend")
        .setDescription(
            "Ends an active giveaway immediately and picks the winner(s).",
        )
        .addStringOption((option) =>
            option
                .setName("messageid")
                .setDescription("The message ID of the giveaway to end.")
                .setRequired(true),
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    async execute(interaction) {
        try {
            // Validate guild context
            if (!interaction.inGuild()) {
                throw new TitanBotError(
                    'Giveaway command used outside guild',
                    ErrorTypes.VALIDATION,
                    'This command can only be used in a server.',
                    { userId: interaction.user.id }
                );
            }

            // Validate permissions
            if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
                throw new TitanBotError(
                    'User lacks ManageGuild permission',
                    ErrorTypes.PERMISSION,
                    "You need the 'Manage Server' permission to end a giveaway.",
                    { userId: interaction.user.id, guildId: interaction.guildId }
                );
            }

            logger.info(`Giveaway end initiated by ${interaction.user.tag} in guild ${interaction.guildId}`);

            const messageId = interaction.options.getString("messageid");

            // Validate message ID format
            if (!messageId || !/^\d+$/.test(messageId)) {
                throw new TitanBotError(
                    'Invalid message ID format',
                    ErrorTypes.VALIDATION,
                    'Please provide a valid message ID.',
                    { providedId: messageId }
                );
            }

            const giveaways = await getGuildGiveaways(interaction.client, interaction.guildId);
            const giveaway = giveaways.find(g => g.messageId === messageId);

            if (!giveaway) {
                throw new TitanBotError(
                    `Giveaway not found: ${messageId}`,
                    ErrorTypes.VALIDATION,
                    "No giveaway was found with that message ID in the database.",
                    { messageId, guildId: interaction.guildId }
                );
            }

            // Use service layer to end giveaway (handles state management atomically)
            const endResult = await endGiveawayService(
                interaction.client,
                giveaway,
                interaction.guildId,
                interaction.user.id
            );

            const updatedGiveaway = endResult.giveaway;
            const winners = endResult.winners;

            // Fetch and update the message
            const channel = await interaction.client.channels.fetch(
                updatedGiveaway.channelId,
            ).catch(err => {
                logger.warn(`Could not fetch channel ${updatedGiveaway.channelId}:`, err.message);
                return null;
            });

            if (!channel || !channel.isTextBased()) {
                throw new TitanBotError(
                    `Channel not found: ${updatedGiveaway.channelId}`,
                    ErrorTypes.VALIDATION,
                    "Could not find the channel where the giveaway was hosted. The giveaway state has been updated.",
                    { channelId: updatedGiveaway.channelId, messageId }
                );
            }

            const message = await channel.messages
                .fetch(messageId)
                .catch(err => {
                    logger.warn(`Could not fetch message ${messageId}:`, err.message);
                    return null;
                });

            if (!message) {
                throw new TitanBotError(
                    `Message not found: ${messageId}`,
                    ErrorTypes.VALIDATION,
                    "Could not find the giveaway message. The giveaway state has been updated.",
                    { messageId, channelId: updatedGiveaway.channelId }
                );
            }

            // Save updated giveaway to database
            await saveGiveaway(
                interaction.client,
                interaction.guildId,
                updatedGiveaway,
            );

            // Update the original message with ended embed
            const newEmbed = createGiveawayEmbed(updatedGiveaway, "ended", winners);
            const newRow = createGiveawayButtons(true);

            await message.edit({
                content: "🎉 **GIVEAWAY ENDED** 🎉",
                embeds: [newEmbed],
                components: [newRow],
            });

            // Announce winners
            if (winners.length > 0) {
                const winnerMentions = winners
                    .map((id) => `<@${id}>`)
                    .join(", ");
                await channel.send({
                    content: `🎉 CONGRATULATIONS ${winnerMentions}! You won the **${updatedGiveaway.prize}** giveaway! Please contact the host <@${updatedGiveaway.hostId}> to claim your prize.`,
                });

                logger.info(`Giveaway ended with ${winners.length} winner(s): ${messageId}`);

                // Log giveaway winner event
                try {
                    await logEvent({
                        client: interaction.client,
                        guildId: interaction.guildId,
                        eventType: EVENT_TYPES.GIVEAWAY_WINNER,
                        data: {
                            description: `Giveaway ended with ${winners.length} winner(s)`,
                            channelId: channel.id,
                            userId: interaction.user.id,
                            fields: [
                                {
                                    name: '🎁 Prize',
                                    value: updatedGiveaway.prize || 'Mystery Prize!',
                                    inline: true
                                },
                                {
                                    name: '🏆 Winners',
                                    value: winnerMentions,
                                    inline: false
                                },
                                {
                                    name: '👥 Entries',
                                    value: endResult.participantCount.toString(),
                                    inline: true
                                }
                            ]
                        }
                    });
                } catch (logError) {
                    logger.debug('Error logging giveaway winner event:', logError);
                }
            } else {
                await channel.send({
                    content: `The giveaway for **${updatedGiveaway.prize}** has ended with no valid entries.`,
                });
                logger.info(`Giveaway ended with no winners: ${messageId}`);
            }

            logger.info(`Giveaway successfully ended by ${interaction.user.tag}: ${messageId}`);

            return interaction.reply({
                embeds: [
                    successEmbed(
                        "Giveaway Ended ✅",
                        `Successfully ended the giveaway for **${updatedGiveaway.prize}** in ${channel}. Selected ${winners.length} winner(s) from ${endResult.participantCount} entries.`,
                    ),
                ],
                flags: MessageFlags.Ephemeral,
            });

        } catch (error) {
            logger.error('Error in gend command:', error);
            await handleInteractionError(interaction, error, {
                type: 'command',
                commandName: 'gend',
                context: 'giveaway_end'
            });
        }
    },
};



