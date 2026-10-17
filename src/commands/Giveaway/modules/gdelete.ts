import type { Command } from '../../../types/index.js';
import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, type GuildMember, type Channel } from 'discord.js';
import { errorEmbed, successEmbed } from '../../../utils/embeds.js';
import { logger } from '../../../utils/logger.js';
import { NexoBotError, ErrorTypes } from '../../../utils/errorHandler.js';
import { getGuildGiveaways, deleteGiveaway } from '../../../utils/giveaways.js';
import { logEvent, EVENT_TYPES } from '../../../services/loggingService.js';

import { InteractionHelper } from '../../../utils/interactionHelper.js';
export default {
    data: new SlashCommandBuilder()
        .setName("gdelete")
        .setDescription(
            "Löscht eine Giveaway-Nachricht und entfernt sie aus der Datenbank.",
        )
        .addStringOption((option) =>
            option
                .setName("messageid")
                .setDescription("Die Nachrichten-ID des Giveaways, das gelöscht werden soll.")
                .setRequired(true),
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    async execute(interaction) {
        if (!interaction.inGuild()) {
            throw new NexoBotError(
                'Giveaway command used outside guild',
                ErrorTypes.VALIDATION,
                'Dieser Command kann nur auf einem Server genutzt werden.',
                { userId: interaction.user.id }
            );
        }

        if (!(interaction.member as GuildMember).permissions.has(PermissionFlagsBits.ManageGuild)) {
            throw new NexoBotError(
                'User lacks ManageGuild permission',
                ErrorTypes.PERMISSION,
                "Du brauchst die Berechtigung „Server verwalten“, um ein Giveaway zu löschen.",
                { userId: interaction.user.id, guildId: interaction.guildId }
            );
        }

        logger.info(`Giveaway deletion started by ${interaction.user.tag} in guild ${interaction.guildId}`);

        const messageId = interaction.options.getString("messageid");

        if (!messageId || !/^\d+$/.test(messageId)) {
            throw new NexoBotError(
                'Invalid message ID format',
                ErrorTypes.VALIDATION,
                'Bitte gib eine gültige Nachrichten-ID an.',
                { providedId: messageId }
            );
        }

        const giveaways = await getGuildGiveaways(interaction.client, interaction.guildId);
        const giveaway = giveaways.find(g => g.messageId === messageId);

        if (!giveaway) {
            throw new NexoBotError(
                `Giveaway not found: ${messageId}`,
                ErrorTypes.VALIDATION,
                "Mit dieser Nachrichten-ID wurde kein Giveaway gefunden.",
                { messageId, guildId: interaction.guildId }
            );
        }

        let deletedMessage = false;
        let channelName = "Unbekannter Kanal";

        const tryDeleteFromChannel = async (channel: Channel | null) => {
            if (!channel || !channel.isTextBased() || !channel.messages?.fetch) {
                return false;
            }

            const message = await channel.messages.fetch(messageId).catch(() => null);
            if (!message) {
                return false;
            }

            await message.delete();
            channelName = (channel as { name?: string | null }).name || 'unbekannter-kanal';
            deletedMessage = true;
            return true;
        };

        try {
            const channel = await interaction.client.channels.fetch(giveaway.channelId!).catch(() => null);
            if (await tryDeleteFromChannel(channel)) {
                logger.debug(`Deleted giveaway message ${messageId} from channel ${channelName}`);
            }

            if (!deletedMessage && interaction.guild) {
                const textChannels = interaction.guild.channels.cache.filter(
                    ch => ch.id !== giveaway.channelId && ch.isTextBased() && ch.messages?.fetch
                );

                for (const [, guildChannel] of textChannels) {
                    const foundAndDeleted = await tryDeleteFromChannel(guildChannel).catch(() => false);
                    if (foundAndDeleted) {
                        logger.debug(`Deleted giveaway message ${messageId} via fallback lookup in #${channelName}`);
                        break;
                    }
                }
            }
        } catch (error) {
            logger.warn(`Could not delete giveaway message: ${error instanceof Error ? error.message : String(error)}`);
        }

        const removedFromDatabase = await deleteGiveaway(
            interaction.client,
            interaction.guildId,
            messageId,
        );

        if (!removedFromDatabase) {
            throw new NexoBotError(
                `Failed to delete giveaway from database: ${messageId}`,
                ErrorTypes.UNKNOWN,
                'Das Giveaway konnte nicht aus der Datenbank entfernt werden. Bitte versuch es erneut.',
                { messageId, guildId: interaction.guildId }
            );
        }

        const giveawaysAfterDelete = await getGuildGiveaways(interaction.client, interaction.guildId);
        const stillExistsInDatabase = giveawaysAfterDelete.some(g => g.messageId === messageId);

        if (stillExistsInDatabase) {
            throw new NexoBotError(
                `Giveaway still exists after deletion: ${messageId}`,
                ErrorTypes.UNKNOWN,
                'Das Löschen wurde nicht in der Datenbank gespeichert. Bitte versuch es erneut.',
                { messageId, guildId: interaction.guildId }
            );
        }

        const statusMsg = deletedMessage
            ? ` und die Nachricht wurde aus #${channelName} entfernt`
            : `, die Nachricht war aber bereits gelöscht oder der Kanal war nicht erreichbar`;

        const winnerIds = Array.isArray(giveaway.winnerIds) ? giveaway.winnerIds : [];
        const hasWinners = winnerIds.length > 0;
        const wasEnded = giveaway.ended === true || giveaway.isEnded === true || hasWinners;

        const winnerStatusMsg = hasWinners
            ? `Für dieses Giveaway wurden bereits ${winnerIds.length} Gewinner gezogen.`
            : wasEnded
                ? 'Dieses Giveaway wurde ohne gültige Gewinner beendet.'
                : 'Vor dem Löschen wurde kein Gewinner gezogen.';

        logger.info(`Giveaway deleted: ${messageId} in ${channelName}`);

        try {
            await logEvent({
                client: interaction.client,
                guildId: interaction.guildId,
                eventType: EVENT_TYPES.GIVEAWAY_DELETE,
                data: {
                    description: `Giveaway gelöscht: ${giveaway.prize}`,
                    channelId: giveaway.channelId,
                    userId: interaction.user.id,
                    fields: [
                        {
                            name: 'Preis',
                            value: giveaway.prize || 'Unbekannt',
                            inline: true
                        },
                        {
                            name: 'Teilnahmen',
                            value: (giveaway.participants?.length || 0).toString(),
                            inline: true
                        }
                    ]
                }
            });
        } catch (logError) {
            logger.debug('Error logging giveaway deletion:', logError);
        }

        return InteractionHelper.safeReply(interaction, {
            embeds: [
                successEmbed(
                    "Giveaway gelöscht",
                    `Das Giveaway für **${giveaway.prize}** wurde gelöscht${statusMsg}. ${winnerStatusMsg}`,
                ),
            ],
            flags: MessageFlags.Ephemeral,
        });
    },
} satisfies Command;
