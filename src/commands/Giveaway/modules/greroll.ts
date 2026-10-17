import type { Command } from '../../../types/index.js';
import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, type GuildMember, type SendableChannels } from 'discord.js';
import { errorEmbed, successEmbed } from '../../../utils/embeds.js';
import { logger } from '../../../utils/logger.js';
import { NexoBotError, ErrorTypes } from '../../../utils/errorHandler.js';
import { getGuildGiveaways, saveGiveaway } from '../../../utils/giveaways.js';
import type { Giveaway } from '../../../utils/giveaways.js';
import { 
    selectWinners,
    createGiveawayEmbed, 
    createGiveawayButtons 
} from '../../../services/giveawayService.js';
import { logEvent, EVENT_TYPES } from '../../../services/loggingService.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName("greroll")
        .setDescription("Zieht neue Gewinner für ein beendetes Giveaway.")
        .addStringOption((option) =>
            option
                .setName("messageid")
                .setDescription("Die Nachrichten-ID des beendeten Giveaways.")
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
                "Du brauchst die Berechtigung „Server verwalten“, um neue Gewinner zu ziehen.",
                { userId: interaction.user.id, guildId: interaction.guildId }
            );
        }

        logger.info(`Giveaway reroll initiated by ${interaction.user.tag} in guild ${interaction.guildId}`);

        const messageId = interaction.options.getString("messageid");

        if (!messageId || !/^\d+$/.test(messageId)) {
            throw new NexoBotError(
                'Invalid message ID format',
                ErrorTypes.VALIDATION,
                'Bitte gib eine gültige Nachrichten-ID an.',
                { providedId: messageId }
            );
        }

        const giveaways = await getGuildGiveaways(
            interaction.client,
            interaction.guildId,
        );

        const giveaway = giveaways.find(g => g.messageId === messageId);

        if (!giveaway) {
            throw new NexoBotError(
                `Giveaway not found: ${messageId}`,
                ErrorTypes.VALIDATION,
                "In der Datenbank wurde kein Giveaway mit dieser Nachrichten-ID gefunden.",
                { messageId, guildId: interaction.guildId }
            );
        }

        if (!giveaway.isEnded && !giveaway.ended) {
            throw new NexoBotError(
                `Giveaway still active: ${messageId}`,
                ErrorTypes.VALIDATION,
                "Dieses Giveaway läuft noch. Beende es zuerst mit `/giveaway end`.",
                { messageId, status: 'active' }
            );
        }

        const participants = giveaway.participants || [];

        if (participants.length < giveaway.winnerCount!) {
            throw new NexoBotError(
                `Insufficient participants for reroll: ${participants.length} < ${giveaway.winnerCount}`,
                ErrorTypes.VALIDATION,
                "Nicht genug Teilnahmen, um die nötige Anzahl an Gewinnern zu ziehen.",
                { participantsCount: participants.length, winnersNeeded: giveaway.winnerCount }
            );
        }

        const newWinners = selectWinners(
            participants,
            giveaway.winnerCount!,
        );

        const updatedGiveaway: Giveaway = {
            ...giveaway,
            winnerIds: newWinners,
            rerolledAt: new Date().toISOString(),
            rerolledBy: interaction.user.id
        };

        const channel = await interaction.client.channels.fetch(
            giveaway.channelId!,
        ).catch(err => {
            logger.warn(`Could not fetch channel ${giveaway.channelId}:`, err.message);
            return null;
        });

        if (!channel || !channel.isTextBased()) {

            await saveGiveaway(
                interaction.client,
                interaction.guildId,
                updatedGiveaway,
            );

            logger.warn(`Could not find channel for giveaway ${messageId}, but saved new winners to database`);

            return InteractionHelper.safeReply(interaction, {
                embeds: [
                    successEmbed(
                        "Neu gezogen",
                        "Die neuen Gewinner wurden gezogen und gespeichert. Der Kanal für die Ankündigung wurde nicht gefunden.",
                    ),
                ],
                flags: MessageFlags.Ephemeral,
            });
        }

        const message = await channel.messages
            .fetch(messageId)
            .catch(err => {
                logger.warn(`Could not fetch message ${messageId}:`, err.message);
                return null;
            });

        if (!message) {

            await saveGiveaway(
                interaction.client,
                interaction.guildId,
                updatedGiveaway,
            );

            const winnerMentions = newWinners
                .map((id) => `<@${id}>`)
                .join(",");

            const existingPingMsg = giveaway.winnerPingMessageId
                ? await channel.messages.fetch(giveaway.winnerPingMessageId as string).catch(() => null)
                : null;
            if (existingPingMsg) {
                await existingPingMsg.edit({
                    content: `🔄 **GIVEAWAY NEU GEZOGEN** 🔄 Neue Gewinner für **${giveaway.prize}**: ${winnerMentions}!`,
                });
            } else {
                const newPingMsg = await (channel as SendableChannels).send({
                    content: `🔄 **GIVEAWAY NEU GEZOGEN** 🔄 Neue Gewinner für **${giveaway.prize}**: ${winnerMentions}!`,
                });
                updatedGiveaway.winnerPingMessageId = newPingMsg.id;
            }

            logger.info(`Giveaway rerolled (message not found, but announced): ${messageId}`);

            try {
                await logEvent({
                    client: interaction.client,
                    guildId: interaction.guildId,
                    eventType: EVENT_TYPES.GIVEAWAY_REROLL,
                    data: {
                        description: `Giveaway neu gezogen: ${giveaway.prize}`,
                        channelId: giveaway.channelId,
                        userId: interaction.user.id,
                        fields: [
                            {
                                name: 'Preis',
                                value: giveaway.prize || 'Überraschungspreis!',
                                inline: true
                            },
                            {
                                name: 'Neue Gewinner',
                                value: winnerMentions,
                                inline: false
                            },
                            {
                                name: 'Teilnahmen gesamt',
                                value: participants.length.toString(),
                                inline: true
                            }
                        ]
                    }
                });
            } catch (logError) {
                logger.debug('Error logging giveaway reroll:', logError);
            }

            return InteractionHelper.safeReply(interaction, {
                embeds: [
                    successEmbed(
                        "Neu gezogen",
                        `Die neuen Gewinner wurden in ${channel} bekannt gegeben. (Ursprüngliche Nachricht nicht gefunden.)`,
                    ),
                ],
                flags: MessageFlags.Ephemeral,
            });
        }

        await saveGiveaway(
            interaction.client,
            interaction.guildId,
            updatedGiveaway,
        );

        const newEmbed = createGiveawayEmbed(updatedGiveaway, "reroll", newWinners);
        const newRow = createGiveawayButtons(true);

        await message.edit({
            content: "🔄 **GIVEAWAY NEU GEZOGEN** 🔄",
            embeds: [newEmbed],
            components: [newRow],
        });

        const winnerMentions = newWinners
            .map((id) => `<@${id}>`)
            .join(",");

        const existingPingMsg = giveaway.winnerPingMessageId
            ? await channel.messages.fetch(giveaway.winnerPingMessageId as string).catch(() => null)
            : null;
        if (existingPingMsg) {
            await existingPingMsg.edit({
                content: `🔄 **NEUE GEWINNER** 🔄 HERZLICHEN GLÜCKWUNSCH ${winnerMentions}! Du hast das Giveaway **${giveaway.prize}** gewonnen! Melde dich beim Host <@${giveaway.hostId}>, um deinen Preis abzuholen.`,
            });
        } else {
            const newPingMsg = await (channel as SendableChannels).send({
                content: `🔄 **NEUE GEWINNER** 🔄 HERZLICHEN GLÜCKWUNSCH ${winnerMentions}! Du hast das Giveaway **${giveaway.prize}** gewonnen! Melde dich beim Host <@${giveaway.hostId}>, um deinen Preis abzuholen.`,
            });
            updatedGiveaway.winnerPingMessageId = newPingMsg.id;
        }

        logger.info(`Giveaway successfully rerolled: ${messageId} with ${newWinners.length} new winners`);

        try {
            await logEvent({
                client: interaction.client,
                guildId: interaction.guildId,
                eventType: EVENT_TYPES.GIVEAWAY_REROLL,
                data: {
                    description: `Giveaway neu gezogen: ${giveaway.prize}`,
                    channelId: giveaway.channelId,
                    userId: interaction.user.id,
                    fields: [
                        {
                            name: 'Preis',
                            value: giveaway.prize || 'Überraschungspreis!',
                            inline: true
                        },
                        {
                            name: 'Neue Gewinner',
                            value: winnerMentions,
                            inline: false
                        },
                        {
                            name: 'Teilnahmen gesamt',
                            value: participants.length.toString(),
                            inline: true
                        }
                    ]
                }
            });
        } catch (logError) {
            logger.debug('Error logging giveaway reroll event:', logError);
        }

        return InteractionHelper.safeReply(interaction, {
            embeds: [
                successEmbed(
                    "Erfolgreich neu gezogen ✅",
                    `Für das Giveaway **${giveaway.prize}** in ${channel} wurden ${newWinners.length} neue Gewinner gezogen.`,
                ),
            ],
            flags: MessageFlags.Ephemeral,
        });
    },
} satisfies Command;
