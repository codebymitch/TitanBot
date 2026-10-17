import { MessageFlags, PermissionFlagsBits } from 'discord.js';
import type { ButtonInteraction, GuildMember } from 'discord.js';
import type { NexoClient } from '../types/index.js';
import { successEmbed } from '../utils/embeds.js';
import { logger } from '../utils/logger.js';
import { NexoBotError, ErrorTypes, handleInteractionError, replyUserError } from '../utils/errorHandler.js';
import { 
    getGuildGiveaways, 
    saveGiveaway, 
    isGiveawayEnded 
} from '../utils/giveaways.js';
import { Mutex } from '../utils/mutex.js';
import { 
    selectWinners,
    isUserRateLimited,
    recordUserInteraction,
    createGiveawayEmbed,
    createGiveawayButtons
} from '../services/giveawayService.js';
import { logEvent, EVENT_TYPES } from '../services/loggingService.js';

export const giveawayJoinHandler = {
    customId: 'giveaway_join',
    async execute(interaction: ButtonInteraction, client: NexoClient): Promise<unknown> {
        try {
            
            if (isUserRateLimited(interaction.user.id, interaction.message.id)) {
                return replyUserError(interaction, { type: ErrorTypes.RATE_LIMIT, message: 'Warte bitte einen Moment, bevor du erneut mit diesem Giveaway interagierst.' });
            }

            await recordUserInteraction(interaction.user.id, interaction.message.id);

            const lockKey = `giveaway:${interaction.message.id}`;
            await Mutex.runExclusive(lockKey, async () => {
                const guildGiveaways = await getGuildGiveaways(client, interaction.guildId!);
                const giveaway = guildGiveaways.find(g => g.messageId === interaction.message.id);

                if (!giveaway) {
                    throw new NexoBotError(
                        'Giveaway not found in database',
                        ErrorTypes.VALIDATION,
                        'Dieses Giveaway ist nicht mehr aktiv.',
                        { messageId: interaction.message.id, guildId: interaction.guildId }
                    );
                }

                const endedByTime = isGiveawayEnded(giveaway);
                const endedByFlag = giveaway.ended || giveaway.isEnded;

                if (endedByTime || endedByFlag) {
                    return replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Dieses Giveaway ist bereits beendet.' });
                }

                const participants = giveaway.participants || [];
                const userId = interaction.user.id;

                if (participants.includes(userId)) {
                    return replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Du nimmst bereits an diesem Giveaway teil! 🎉' });
                }

                participants.push(userId);
                giveaway.participants = participants;

                await saveGiveaway(client, interaction.guildId!, giveaway);

                logger.debug(`User ${interaction.user.tag} joined giveaway ${interaction.message.id}`);

                const updatedEmbed = createGiveawayEmbed(giveaway, 'active');
                const updatedRow = createGiveawayButtons(false);

                await interaction.message.edit({
                    embeds: [updatedEmbed],
                    components: [updatedRow]
                });

                await interaction.reply({
                    embeds: [
                        successEmbed(
                            'Geschafft! Du nimmst jetzt am Giveaway teil! 🎉',
                            `Viel Glück! Es gibt jetzt ${participants.length} Teilnahme(n).`
                        )
                    ],
                    flags: MessageFlags.Ephemeral
                });
            });
        } catch (error) {
            logger.error('Error in giveaway join handler:', error);
            await handleInteractionError(interaction, error, {
                type: 'button',
                customId: 'giveaway_join',
                handler: 'giveaway'
            });
        }
    }
};

export const giveawayEndHandler = {
    customId: 'giveaway_end',
    async execute(interaction: ButtonInteraction, client: NexoClient): Promise<unknown> {
        try {
            
            if (!interaction.inGuild()) {
                throw new NexoBotError(
                    'Button used outside guild',
                    ErrorTypes.VALIDATION,
                    'Diesen Button kannst du nur auf einem Server nutzen.',
                    { userId: interaction.user.id }
                );
            }

            if (!(interaction.member as GuildMember).permissions.has(PermissionFlagsBits.ManageGuild)) {
                return replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: 'Du brauchst die Berechtigung „Server verwalten“, um ein Giveaway zu beenden.' });
            }

            const guildGiveaways = await getGuildGiveaways(client, interaction.guildId);
            const giveaway = guildGiveaways.find(g => g.messageId === interaction.message.id);

            if (!giveaway) {
                throw new NexoBotError(
                    'Giveaway not found in database',
                    ErrorTypes.VALIDATION,
                    'Dieses Giveaway ist nicht mehr aktiv.',
                    { messageId: interaction.message.id, guildId: interaction.guildId }
                );
            }

            if (giveaway.ended || giveaway.isEnded || isGiveawayEnded(giveaway)) {
                throw new NexoBotError(
                    'Giveaway already ended',
                    ErrorTypes.VALIDATION,
                    'Dieses Giveaway ist bereits beendet.',
                    { messageId: interaction.message.id }
                );
            }

            const participants = giveaway.participants || [];
            const winners = selectWinners(participants, giveaway.winnerCount!);

            giveaway.ended = true;
            giveaway.isEnded = true;
            giveaway.winnerIds = winners;
            giveaway.endedAt = new Date().toISOString();
            giveaway.endedBy = interaction.user.id;

            await saveGiveaway(client, interaction.guildId, giveaway);

            logger.info(`Giveaway ended via button by ${interaction.user.tag}: ${interaction.message.id}`);

            const updatedEmbed = createGiveawayEmbed(giveaway, 'ended', winners);
            const updatedRow = createGiveawayButtons(true);

            await interaction.message.edit({
                content: '🎉 **GIVEAWAY BEENDET** 🎉',
                embeds: [updatedEmbed],
                components: [updatedRow]
            });

            try {
                await logEvent({
                    client,
                    guildId: interaction.guildId,
                    eventType: EVENT_TYPES.GIVEAWAY_WINNER,
                    data: {
                        description: `Giveaway mit ${winners.length} Gewinner(n) beendet`,
                        channelId: interaction.channelId,
                        userId: interaction.user.id,
                        fields: [
                            {
                                name: '🎁 Preis',
                                value: giveaway.prize || 'Überraschungspreis!',
                                inline: true
                            },
                            {
                                name: '🏆 Gewinner',
                                value: winners.length > 0 
                                    ? winners.map(id => `<@${id}>`).join(', ')
                                    : 'Keine gültigen Teilnahmen',
                                inline: false
                            },
                            {
                                name: '👥 Teilnahmen gesamt',
                                value: participants.length.toString(),
                                inline: true
                            }
                        ]
                    }
                });
            } catch (logError) {
                logger.debug('Error logging giveaway end event:', logError);
            }

            await interaction.reply({
                embeds: [
                    successEmbed(
                        `Giveaway beendet ✅`,
                        `Das Giveaway wurde beendet und ${winners.length} Gewinner ausgelost!`
                    )
                ],
                flags: MessageFlags.Ephemeral
            });

        } catch (error) {
            logger.error('Error in giveaway end handler:', error);
            await handleInteractionError(interaction, error, {
                type: 'button',
                customId: 'giveaway_end',
                handler: 'giveaway'
            });
        }
    }
};

export const giveawayRerollHandler = {
    customId: 'giveaway_reroll',
    async execute(interaction: ButtonInteraction, client: NexoClient): Promise<unknown> {
        try {
            
            if (!interaction.inGuild()) {
                throw new NexoBotError(
                    'Button used outside guild',
                    ErrorTypes.VALIDATION,
                    'Diesen Button kannst du nur auf einem Server nutzen.',
                    { userId: interaction.user.id }
                );
            }

            if (!(interaction.member as GuildMember).permissions.has(PermissionFlagsBits.ManageGuild)) {
                return replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: 'Du brauchst die Berechtigung „Server verwalten“, um ein Giveaway neu auszulosen.' });
            }

            const guildGiveaways = await getGuildGiveaways(client, interaction.guildId);
            const giveaway = guildGiveaways.find(g => g.messageId === interaction.message.id);

            if (!giveaway) {
                throw new NexoBotError(
                    'Giveaway not found in database',
                    ErrorTypes.VALIDATION,
                    'Dieses Giveaway ist nicht mehr aktiv.',
                    { messageId: interaction.message.id, guildId: interaction.guildId }
                );
            }

            if (!giveaway.ended && !giveaway.isEnded) {
                throw new NexoBotError(
                    'Giveaway still active',
                    ErrorTypes.VALIDATION,
                    'Dieses Giveaway läuft noch. Bitte beende es zuerst.',
                    { messageId: interaction.message.id }
                );
            }

            const participants = giveaway.participants || [];
            
            if (participants.length === 0) {
                throw new NexoBotError(
                    'No participants to reroll',
                    ErrorTypes.VALIDATION,
                    'Es gibt keine Teilnahmen für eine neue Auslosung.',
                    { messageId: interaction.message.id }
                );
            }

            const newWinners = selectWinners(participants, giveaway.winnerCount!);

            giveaway.winnerIds = newWinners;
            giveaway.rerolledAt = new Date().toISOString();
            giveaway.rerolledBy = interaction.user.id;

            await saveGiveaway(client, interaction.guildId, giveaway);

            logger.info(`Giveaway rerolled via button by ${interaction.user.tag}: ${interaction.message.id}`);

            const updatedEmbed = createGiveawayEmbed(giveaway, 'reroll', newWinners);
            const updatedRow = createGiveawayButtons(true);

            await interaction.message.edit({
                content: '🔄 **GIVEAWAY NEU AUSGELOST** 🔄',
                embeds: [updatedEmbed],
                components: [updatedRow]
            });

            try {
                await logEvent({
                    client,
                    guildId: interaction.guildId,
                    eventType: EVENT_TYPES.GIVEAWAY_REROLL,
                    data: {
                        description: `Giveaway neu ausgelost`,
                        channelId: interaction.channelId,
                        userId: interaction.user.id,
                        fields: [
                            {
                                name: '🎁 Preis',
                                value: giveaway.prize || 'Überraschungspreis!',
                                inline: true
                            },
                            {
                                name: '🏆 Neue Gewinner',
                                value: newWinners.map(id => `<@${id}>`).join(', '),
                                inline: false
                            },
                            {
                                name: '👥 Teilnahmen gesamt',
                                value: participants.length.toString(),
                                inline: true
                            }
                        ]
                    }
                });
            } catch (logError) {
                logger.debug('Error logging giveaway reroll event:', logError);
            }

            await interaction.reply({
                embeds: [
                    successEmbed(
                        'Giveaway neu ausgelost ✅',
                        `Neue Gewinner wurden ausgelost!`
                    )
                ],
                flags: MessageFlags.Ephemeral
            });

        } catch (error) {
            logger.error('Error in giveaway reroll handler:', error);
            await handleInteractionError(interaction, error, {
                type: 'button',
                customId: 'giveaway_reroll',
                handler: 'giveaway'
            });
        }
    }
};

export const giveawayViewHandler = {
    customId: 'giveaway_view',
    async execute(interaction: ButtonInteraction, client: NexoClient): Promise<unknown> {
        try {
            if (!interaction.inGuild()) {
                throw new NexoBotError(
                    'Button used outside guild',
                    ErrorTypes.VALIDATION,
                    'Diesen Button kannst du nur auf einem Server nutzen.',
                    { userId: interaction.user.id }
                );
            }

            const guildGiveaways = await getGuildGiveaways(client, interaction.guildId);
            const giveaway = guildGiveaways.find(g => g.messageId === interaction.message.id);

            if (!giveaway) {
                throw new NexoBotError(
                    'Giveaway not found in database',
                    ErrorTypes.VALIDATION,
                    'Dieses Giveaway wurde nicht gefunden.',
                    { messageId: interaction.message.id, guildId: interaction.guildId }
                );
            }

            if (!giveaway.ended && !giveaway.isEnded && !isGiveawayEnded(giveaway)) {
                return replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Dieses Giveaway läuft noch, daher gibt es noch keine Gewinner.' });
            }

            const winnerIds = Array.isArray(giveaway.winnerIds) ? giveaway.winnerIds : [];
            const winnerMentions = winnerIds.length > 0
                ? winnerIds.map(id => `<@${id}>`).join(', ')
                : 'Für dieses Giveaway wurden keine gültigen Gewinner ausgelost.';

            await interaction.reply({
                embeds: [
                    successEmbed(
                        `Gewinner für ${giveaway.prize || 'dieses Giveaway'} 🎉`,
                        winnerMentions
                    )
                ],
                flags: MessageFlags.Ephemeral
            });
        } catch (error) {
            logger.error('Error in giveaway view handler:', error);
            await handleInteractionError(interaction, error, {
                type: 'button',
                customId: 'giveaway_view',
                handler: 'giveaway'
            });
        }
    }
};