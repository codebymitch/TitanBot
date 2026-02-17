import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { errorEmbed, successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { TitanBotError, ErrorTypes, handleInteractionError } from '../../utils/errorHandler.js';
import { getGuildGiveaways, deleteGiveaway } from '../../utils/giveaways.js';
import { logEvent, EVENT_TYPES } from '../../services/loggingService.js';

export default {
    data: new SlashCommandBuilder()
        .setName("gdelete")
        .setDescription(
            "Deletes a giveaway message and removes it from the database (no winner picked).",
        )
        .addStringOption((option) =>
            option
                .setName("messageid")
                .setDescription("The message ID of the giveaway to delete.")
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
                    "You need the 'Manage Server' permission to delete a giveaway.",
                    { userId: interaction.user.id, guildId: interaction.guildId }
                );
            }

            logger.info(`Giveaway deletion started by ${interaction.user.tag} in guild ${interaction.guildId}`);

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
                    "No giveaway was found with that message ID.",
                    { messageId, guildId: interaction.guildId }
                );
            }

            let deletedMessage = false;
            let channelName = "Unknown Channel";

            // Try to delete the message
            try {
                const channel = await interaction.client.channels.fetch(giveaway.channelId).catch(() => null);
                if (channel && channel.isTextBased()) {
                    channelName = channel.name;
                    const message = await channel.messages.fetch(messageId).catch(() => null);
                    if (message) {
                        await message.delete();
                        deletedMessage = true;
                        logger.debug(`Deleted giveaway message ${messageId} from channel ${channelName}`);
                    }
                }
            } catch (error) {
                logger.warn(`Could not delete giveaway message: ${error.message}`);
            }

            // Remove from database
            await deleteGiveaway(
                interaction.client,
                interaction.guildId,
                messageId,
            );

            const statusMsg = deletedMessage
                ? `and the message was deleted from #${channelName}`
                : `but the message was already deleted or the channel was inaccessible.`;

            logger.info(`Giveaway deleted: ${messageId} in ${channelName}`);

            // Log deletion event
            try {
                await logEvent({
                    client: interaction.client,
                    guildId: interaction.guildId,
                    eventType: EVENT_TYPES.GIVEAWAY_DELETE,
                    data: {
                        description: `Giveaway deleted: ${giveaway.prize}`,
                        channelId: giveaway.channelId,
                        userId: interaction.user.id,
                        fields: [
                            {
                                name: '🎁 Prize',
                                value: giveaway.prize || 'Unknown',
                                inline: true
                            },
                            {
                                name: '📊 Entries',
                                value: (giveaway.participants?.length || 0).toString(),
                                inline: true
                            }
                        ]
                    }
                });
            } catch (logError) {
                logger.debug('Error logging giveaway deletion:', logError);
            }

            return interaction.reply({
                embeds: [
                    successEmbed(
                        "Giveaway Deleted",
                        `Successfully deleted the giveaway for **${giveaway.prize}** ${statusMsg}. No winner was picked.`,
                    ),
                ],
                flags: MessageFlags.Ephemeral,
            });

        } catch (error) {
            logger.error('Error in gdelete command:', error);
            await handleInteractionError(interaction, error, {
                type: 'command',
                commandName: 'gdelete',
                context: 'giveaway_deletion'
            });
        }
    },
};


