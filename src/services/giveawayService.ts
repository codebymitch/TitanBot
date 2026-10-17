// giveawayService.js

import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import type { GuildTextBasedChannel } from 'discord.js';
import type { NexoClient } from '../types/index.js';
import type { Giveaway } from '../utils/giveaways.js';
import { logger } from '../utils/logger.js';
import { NexoBotError, ErrorTypes } from '../utils/errorHandler.js';
import { getColor, botConfig } from '../config/bot.js';
import { getEndedGiveaways, markGiveawayEnded } from '../utils/database.js';
import { checkRateLimit, getRateLimitStatus } from '../utils/rateLimiter.js';
import { logEvent, EVENT_TYPES } from './loggingService.js';

const GIVEAWAY_CONFIG = botConfig.giveaways || {};
const GIVEAWAY_INTERACTION_COOLDOWN = 1000;

function getGiveawayInteractionKey(userId: string, giveawayId: string): string {
    return `giveaway:${userId}:${giveawayId}`;
}

export function parseDuration(durationString: unknown): number {
    if (!durationString || typeof durationString !== 'string') {
        throw new NexoBotError(
            'Invalid duration format provided',
            ErrorTypes.VALIDATION,
            'Bitte gib eine gültige Dauer an (z. B. 1h, 30m, 5d, 10s).',
            { durationString }
        );
    }

    const regex = /^(\d+)([hmds])$/i;
    const match = durationString.trim().match(regex);

    if (!match) {
        throw new NexoBotError(
            `Invalid duration format: ${durationString}`,
            ErrorTypes.VALIDATION,
            'Ungültiges Format für die Dauer. Nutze: 1h, 30m, 5d, 10s (min.: 10s, max.: 30d)',
            { input: durationString }
        );
    }

    const amount = parseInt(match[1], 10);
    const unit = match[2].toLowerCase();

    if (amount <= 0 || amount > 999) {
        throw new NexoBotError(
            `Duration amount out of range: ${amount}`,
            ErrorTypes.VALIDATION,
            'Der Wert für die Dauer muss zwischen 1 und 999 liegen.',
            { amount, unit }
        );
    }

    let ms = 0;
    switch (unit) {
        case 's':
            ms = amount * 1000;
            break;
        case 'm':
            ms = amount * 60 * 1000;
            break;
        case 'h':
            ms = amount * 60 * 60 * 1000;
            break;
        case 'd':
            ms = amount * 24 * 60 * 60 * 1000;
            break;
        default:
            throw new NexoBotError(
                `Unknown duration unit: ${unit}`,
                ErrorTypes.VALIDATION,
                'Bitte nutze s (Sekunden), m (Minuten), h (Stunden) oder d (Tage).',
                { unit }
            );
    }

    const maxDuration = GIVEAWAY_CONFIG.maximumDuration ?? 30 * 24 * 60 * 60 * 1000;
    if (ms > maxDuration) {
        throw new NexoBotError(
            `Duration exceeds maximum: ${ms}ms > ${maxDuration}ms`,
            ErrorTypes.VALIDATION,
            `Die maximale Dauer beträgt ${Math.floor(maxDuration / (24 * 60 * 60 * 1000))} Tage.`,
            { requestedMs: ms, maxMs: maxDuration }
        );
    }

    const minDuration = GIVEAWAY_CONFIG.minimumDuration ?? 10 * 1000;
    if (ms < minDuration) {
        throw new NexoBotError(
            `Duration below minimum: ${ms}ms < ${minDuration}ms`,
            ErrorTypes.VALIDATION,
            `Die minimale Dauer beträgt ${Math.ceil(minDuration / 1000)} Sekunden.`,
            { requestedMs: ms, minMs: minDuration }
        );
    }

    return ms;
}

export function validatePrize(prize: unknown): string {
    if (!prize || typeof prize !== 'string') {
        throw new NexoBotError(
            'Prize must be a non-empty string',
            ErrorTypes.VALIDATION,
            'Bitte gib eine gültige Preisbeschreibung an.',
            { prize }
        );
    }

    const trimmed = prize.trim();
    if (trimmed.length === 0 || trimmed.length > 256) {
        throw new NexoBotError(
            `Prize length out of range: ${trimmed.length}`,
            ErrorTypes.VALIDATION,
            'Der Preis muss zwischen 1 und 256 Zeichen lang sein.',
            { length: trimmed.length }
        );
    }

    return trimmed;
}

export function validateWinnerCount(winnerCount: number): void {
    const minimumWinners = GIVEAWAY_CONFIG.minimumWinners ?? 1;
    const maximumWinners = GIVEAWAY_CONFIG.maximumWinners ?? 10;

    if (!Number.isInteger(winnerCount) || winnerCount < minimumWinners || winnerCount > maximumWinners) {
        throw new NexoBotError(
            `Invalid winner count: ${winnerCount}`,
            ErrorTypes.VALIDATION,
            `Die Anzahl der Gewinner muss zwischen ${minimumWinners} und ${maximumWinners} liegen.`,
            { winnerCount, minimumWinners, maximumWinners }
        );
    }
}

export function createGiveawayEmbed(giveaway: Giveaway, status: string, winners: string[] = []): EmbedBuilder {
    try {
        const statusEmoji = status === 'ended' ? '🎉' : status === 'reroll' ? '🔄' : '🎉';
        const isEnded = status === 'ended' || status === 'reroll';
        const color = isEnded ? getColor('giveaway.ended') : getColor('giveaway.active');
        
        const embed = new EmbedBuilder()
            .setTitle(`${statusEmoji} ${giveaway.prize}`)
            .setDescription('Klick auf den Button unten, um teilzunehmen!')
            .setColor(color)
            .addFields(
                { name: '👤 Veranstaltet von', value: `<@${giveaway.hostId}>`, inline: true },
                { name: '🏆 Gewinner', value: giveaway.winnerCount!.toString(), inline: true },
                { name: '👥 Teilnahmen', value: giveaway.participants?.length?.toString() || '0', inline: true }
            );

        if (isEnded) {
            const winnerDisplay = winners.length > 0 
                ? winners.map(id => `<@${id}>`).join(', ')
                : 'Keine gültigen Teilnahmen';
            embed.addFields({ name: '🎯 Gewinner', value: winnerDisplay, inline: false });
        } else {
            const endTime = giveaway.endsAt || giveaway.endTime;
            embed.addFields({ name: '⏰ Endet', value: `<t:${Math.floor(endTime! / 1000)}:R>`, inline: false });
        }

        embed.setTimestamp();
        
        return embed;
    } catch (error) {
        logger.error('Error creating giveaway embed:', error);
        throw new NexoBotError(
            'Failed to create giveaway embed',
            ErrorTypes.UNKNOWN,
            'Beim Erstellen des Giveaways ist ein interner Fehler aufgetreten.',
            { error: (error as Error).message }
        );
    }
}

export function createGiveawayButtons(ended: boolean = false): ActionRowBuilder<ButtonBuilder> {
    try {
        const row = new ActionRowBuilder<ButtonBuilder>();

        if (ended) {
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId('giveaway_reroll')
                    .setLabel('🎲 Neu auslosen')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(false),
                new ButtonBuilder()
                    .setCustomId('giveaway_view')
                    .setLabel('👁️ Gewinner anzeigen')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(false)
            );
        } else {
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId('giveaway_join')
                    .setLabel('🎉 Teilnehmen')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(false),
                new ButtonBuilder()
                    .setCustomId('giveaway_end')
                    .setLabel('🛑 Beenden')
                    .setStyle(ButtonStyle.Danger)
                    .setDisabled(false)
            );
        }

        return row;
    } catch (error) {
        logger.error('Error creating giveaway buttons:', error);
        throw new NexoBotError(
            'Failed to create giveaway buttons',
            ErrorTypes.UNKNOWN,
            'Beim Erstellen der Buttons ist ein interner Fehler aufgetreten.',
            { error: (error as Error).message }
        );
    }
}

export function selectWinners(participants: string[], winnerCount: number): string[] {
    if (!Array.isArray(participants) || participants.length === 0) {
        return [];
    }

    const uniqueParticipants = [...new Set(participants)];

    if (!Number.isInteger(winnerCount) || winnerCount < 1) {
        throw new NexoBotError(
            'Invalid winner count for selection',
            ErrorTypes.VALIDATION,
            'Es muss mindestens 1 Gewinner geben.',
            { winnerCount }
        );
    }

    const requested = Math.min(winnerCount, uniqueParticipants.length);
    
    try {
        
        const shuffled = [...uniqueParticipants];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled.slice(0, requested);
    } catch (error) {
        logger.error('Error selecting winners:', error);
        throw new NexoBotError(
            'Failed to select winners',
            ErrorTypes.UNKNOWN,
            'Beim Auslosen der Gewinner ist ein Fehler aufgetreten.',
            { error: (error as Error).message, participantCount: participants.length }
        );
    }
}

export function isUserRateLimited(userId: string, giveawayId: string): boolean {
    const status = getRateLimitStatus(
        getGiveawayInteractionKey(userId, giveawayId),
        GIVEAWAY_INTERACTION_COOLDOWN,
    );
    return (status.attempts ?? 0) >= 1 && status.remaining > 0;
}

export async function recordUserInteraction(userId: string, giveawayId: string): Promise<void> {
    await checkRateLimit(
        getGiveawayInteractionKey(userId, giveawayId),
        1,
        GIVEAWAY_INTERACTION_COOLDOWN,
    );
}

export async function endGiveaway(
    client: NexoClient,
    giveaway: Giveaway | null | undefined,
    guildId: string | null,
    endedBy: string,
): Promise<{ giveaway: Giveaway; winners: string[]; participantCount: number }> {
    try {
        if (!giveaway) {
            throw new NexoBotError(
                'Giveaway object is null or undefined',
                ErrorTypes.VALIDATION,
                'Ein nicht existierendes Giveaway kann nicht beendet werden.',
                { giveaway }
            );
        }

        if (giveaway.ended === true || giveaway.isEnded === true) {
            throw new NexoBotError(
                `Giveaway ${giveaway.messageId} is already ended`,
                ErrorTypes.VALIDATION,
                'Dieses Giveaway ist bereits beendet.',
                { giveawayId: giveaway.messageId, status: 'already_ended' }
            );
        }

        const participants = giveaway.participants || [];
        const winners = selectWinners(participants, giveaway.winnerCount || 1);

        const updatedGiveaway = {
            ...giveaway,
            ended: true,
            isEnded: true,
            winnerIds: winners,
            endedAt: new Date().toISOString(),
            endedBy: endedBy,
            participantCount: participants.length
        };

        logger.info(`Ending giveaway ${giveaway.messageId}: selected ${winners.length} winners from ${participants.length} entries`);

        return {
            giveaway: updatedGiveaway,
            winners: winners,
            participantCount: participants.length
        };
    } catch (error) {
        if (error instanceof NexoBotError) {
            logger.debug(`Giveaway end validation error: ${error.message}`, error.context || {});
            throw error;
        }
        logger.error('Error ending giveaway:', error);
        throw new NexoBotError(
            'Failed to end giveaway',
            ErrorTypes.UNKNOWN,
            'Beim Beenden des Giveaways ist ein Fehler aufgetreten.',
            { error: (error as Error).message, giveawayId: giveaway?.messageId }
        );
    }
}

export async function checkGiveaways(client: NexoClient): Promise<void> {
  try {
    if (!client.db) {
      logger.warn('Database not available for giveaway check');
      return;
    }

    const endedGiveaways = await getEndedGiveaways(client);
    
    if (endedGiveaways.length === 0) {
      return;
    }

    logger.info(`Processing ${endedGiveaways.length} ended giveaways`);

    for (const giveawayRecord of endedGiveaways) {
      try {
        const { id: giveawayId, guild_id: guildId, message_id: messageId, data: giveawayData } = giveawayRecord;
        const giveaway: Giveaway = typeof giveawayData === 'string' ? JSON.parse(giveawayData) : giveawayData;

        const guild = client.guilds.cache.get(guildId);
        if (!guild) {
          logger.debug(`Guild ${guildId} not found, skipping giveaway ${messageId}`);
          continue;
        }

        // Giveaways are only posted in text-based channels.
        const channel = await guild.channels.fetch(giveaway.channelId!).catch(() => null) as GuildTextBasedChannel | null;
        if (!channel) {
          logger.debug(`Channel ${giveaway.channelId} not found for giveaway ${messageId}`);
          continue;
        }

        const message = await channel.messages.fetch(messageId).catch(() => null);
        if (!message) {
          logger.debug(`Message ${messageId} not found for giveaway in channel ${giveaway.channelId}`);
          continue;
        }

        const participants = giveaway.participants || [];
        const winners = selectWinners(participants, giveaway.winnerCount || 1);

        const winnerMentions = winners.length > 0
          ? winners.map(id => `<@${id}>`).join(', ')
          : 'Keine gültigen Teilnahmen!';

        const endedEmbed = createGiveawayEmbed(giveaway, 'ended', winners);

        await message.edit({
          embeds: [endedEmbed],
          components: [createGiveawayButtons(true)]
        });

        giveaway.ended = true;
        giveaway.isEnded = true;
        giveaway.winnerIds = winners;
        giveaway.endedAt = new Date().toISOString();

        const markedSuccess = await markGiveawayEnded(client, giveawayId, giveaway);
        if (!markedSuccess) {
          logger.warn(`Failed to mark giveaway ${messageId} as ended in database`);
        }

        if (winners.length > 0) {
          const winnerAnnouncement = `🎉 Glückwunsch ${winnerMentions}! Gewonnen: **${giveaway.prize || 'das Giveaway'}**! Meldet euch bei <@${giveaway.hostId}>, um den Preis abzuholen.`;
          const winnerPingMsg = await channel.send({ content: winnerAnnouncement });
          giveaway.winnerPingMessageId = winnerPingMsg.id;
          await markGiveawayEnded(client, giveawayId, giveaway);

          try {
            await logEvent({
              client,
              guildId,
              eventType: EVENT_TYPES.GIVEAWAY_WINNER,
              data: {
                description: `Giveaway mit ${winners.length} Gewinner(n) beendet`,
                channelId: channel.id,
                fields: [
                  {
                    name: '🎁 Preis',
                    value: giveaway.prize || 'Überraschungspreis!',
                    inline: true
                  },
                  {
                    name: '🏆 Gewinner',
                    value: winners.map(id => `<@${id}>`).join(', '),
                    inline: false
                  },
                  {
                    name: '👥 Teilnahmen',
                    value: participants.length.toString(),
                    inline: true
                  }
                ]
              }
            });
          } catch (error) {
            logger.debug('Error logging giveaway winner:', error);
          }
        } else {
          await channel.send({ content: `Das Giveaway für **${giveaway.prize}** ist ohne gültige Teilnahmen zu Ende gegangen.` });
        }

        logger.info(`Ended giveaway ${messageId} in guild ${guildId}`);
      } catch (error) {
        logger.error(`Error processing giveaway:`, error);
      }
    }
  } catch (error) {
    logger.error('Error checking giveaways:', error);
  }
}