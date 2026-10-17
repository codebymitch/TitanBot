import type { Command } from '../../../types/index.js';
import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, type GuildMember, type SendableChannels } from 'discord.js';
import { errorEmbed, successEmbed } from '../../../utils/embeds.js';
import { logger } from '../../../utils/logger.js';
import { NexoBotError, ErrorTypes } from '../../../utils/errorHandler.js';
import { getGuildGiveaways, saveGiveaway } from '../../../utils/giveaways.js';
import { 
    endGiveaway as endGiveawayService,
    createGiveawayEmbed, 
    createGiveawayButtons 
} from '../../../services/giveawayService.js';
import { logEvent, EVENT_TYPES } from '../../../services/loggingService.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName("gend")
        .setDescription(
            "Beendet ein aktives Giveaway sofort und zieht die Gewinner.",
        )
        .addStringOption((option) =>
            option
                .setName("messageid")
                .setDescription("Die Nachrichten-ID des Giveaways, das beendet werden soll.")
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
                "Du brauchst die Berechtigung „Server verwalten“, um ein Giveaway zu beenden.",
                { userId: interaction.user.id, guildId: interaction.guildId }
            );
        }

        logger.info(`Giveaway end initiated by ${interaction.user.tag} in guild ${interaction.guildId}`);

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
                "In der Datenbank wurde kein Giveaway mit dieser Nachrichten-ID gefunden.",
                { messageId, guildId: interaction.guildId }
            );
        }

        const endResult = await endGiveawayService(
            interaction.client,
            giveaway,
            interaction.guildId,
            interaction.user.id
        );

        const updatedGiveaway = endResult.giveaway;
        const winners = endResult.winners;

        const channel = await interaction.client.channels.fetch(
            updatedGiveaway.channelId!,
        ).catch(err => {
            logger.warn(`Could not fetch channel ${updatedGiveaway.channelId}:`, err.message);
            return null;
        });

        if (!channel || !channel.isTextBased()) {
            throw new NexoBotError(
                `Channel not found: ${updatedGiveaway.channelId}`,
                ErrorTypes.VALIDATION,
                "Der Kanal des Giveaways wurde nicht gefunden. Der Status des Giveaways wurde trotzdem aktualisiert.",
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
            throw new NexoBotError(
                `Message not found: ${messageId}`,
                ErrorTypes.VALIDATION,
                "Die Giveaway-Nachricht wurde nicht gefunden. Der Status des Giveaways wurde trotzdem aktualisiert.",
                { messageId, channelId: updatedGiveaway.channelId }
            );
        }

        await saveGiveaway(
            interaction.client,
            interaction.guildId,
            updatedGiveaway,
        );

        const newEmbed = createGiveawayEmbed(updatedGiveaway, "ended", winners);
        const newRow = createGiveawayButtons(true);

        await message.edit({
            content: "🎉 **GIVEAWAY BEENDET** 🎉",
            embeds: [newEmbed],
            components: [newRow],
        });

        if (winners.length > 0) {
            const winnerMentions = winners
                .map((id) => `<@${id}>`)
                .join(",");
            const winnerPingMsg = await (channel as SendableChannels).send({
                content: `🎉 HERZLICHEN GLÜCKWUNSCH ${winnerMentions}! Du hast das Giveaway **${updatedGiveaway.prize}** gewonnen! Melde dich beim Host <@${updatedGiveaway.hostId}>, um deinen Preis abzuholen.`,
            });
            updatedGiveaway.winnerPingMessageId = winnerPingMsg.id;
            await saveGiveaway(interaction.client, interaction.guildId, updatedGiveaway);

            logger.info(`Giveaway ended with ${winners.length} winner(s): ${messageId}`);

            try {
                await logEvent({
                    client: interaction.client,
                    guildId: interaction.guildId,
                    eventType: EVENT_TYPES.GIVEAWAY_WINNER,
                    data: {
                        description: `Giveaway mit ${winners.length} Gewinner(n) beendet`,
                        channelId: channel.id,
                        userId: interaction.user.id,
                        fields: [
                            {
                                name: 'Preis',
                                value: updatedGiveaway.prize || 'Überraschungspreis!',
                                inline: true
                            },
                            {
                                name: 'Gewinner',
                                value: winnerMentions,
                                inline: false
                            },
                            {
                                name: 'Teilnahmen',
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
            await (channel as SendableChannels).send({
                content: `Das Giveaway für **${updatedGiveaway.prize}** ist ohne gültige Teilnahmen zu Ende gegangen.`,
            });
            logger.info(`Giveaway ended with no winners: ${messageId}`);
        }

        logger.info(`Giveaway successfully ended by ${interaction.user.tag}: ${messageId}`);

        return InteractionHelper.safeReply(interaction, {
            embeds: [
                successEmbed(
                    "Giveaway beendet ✅",
                    `Das Giveaway für **${updatedGiveaway.prize}** in ${channel} wurde beendet. ${winners.length} Gewinner aus ${endResult.participantCount} Teilnahmen gezogen.`,
                ),
            ],
            flags: MessageFlags.Ephemeral,
        });
    },
} satisfies Command;
