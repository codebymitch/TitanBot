// giveaways.js

import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { logger } from './logger.js';
import { NexoBotError, ErrorTypes } from './errorHandler.js';
import { unwrapReplitData } from './database.js';
import { 
    createGiveawayEmbed as createGiveawayEmbedService,
    createGiveawayButtons as createGiveawayButtonsService,
    selectWinners as selectWinnersService
} from '../services/giveawayService.js';
import type { NexoClient } from '../types/index.js';

/** Stored giveaway record (`guild:{guildId}:giveaways`, keyed by messageId). */
export interface Giveaway {
    messageId: string;
    channelId?: string;
    guildId?: string | null;
    prize?: string;
    hostId?: string;
    endTime?: number;
    endsAt?: number;
    winnerCount?: number;
    participants?: string[];
    winnerIds?: string[];
    isEnded?: boolean;
    ended?: boolean;
    createdAt?: string;
    [key: string]: unknown;
}

export function giveawayKey(guildId: string): string {
    return `guild:${guildId}:giveaways`;
}

function arrayToGiveawayMap(giveaways: Giveaway[]): Record<string, Giveaway> {
    const map: Record<string, Giveaway> = {};
    if (Array.isArray(giveaways)) {
        for (const giveaway of giveaways) {
            if (giveaway && giveaway.messageId) {
                map[giveaway.messageId] = giveaway;
            }
        }
    }
    return map;
}

export async function getGuildGiveaways(client: NexoClient, guildId: string): Promise<Giveaway[]> {
    try {
        if (!client.db) {
            logger.warn('Database not available for getGuildGiveaways');
            return [];
        }

        const key = giveawayKey(guildId);
        const giveaways = await client.db.get(key, {});
        const unwrappedGiveaways: unknown = unwrapReplitData(giveaways);

        if (typeof unwrappedGiveaways === 'object' && !Array.isArray(unwrappedGiveaways)) {
            return Object.values(unwrappedGiveaways || {}) as Giveaway[];
        }
        return Array.isArray(unwrappedGiveaways) ? unwrappedGiveaways as Giveaway[] : [];
    } catch (error) {
        logger.error(`Error getting giveaways for guild ${guildId}:`, error);
        return [];
    }
}

export async function saveGiveaway(client: NexoClient, guildId: string, giveawayData: Giveaway): Promise<boolean> {
    try {
        if (!client.db) {
            logger.warn('Database not available for saveGiveaway');
            return false;
        }

        if (!giveawayData || !giveawayData.messageId) {
            throw new NexoBotError(
                'Invalid giveaway data: missing messageId',
                ErrorTypes.VALIDATION,
                'Ein Giveaway kann ohne Nachrichten-ID nicht gespeichert werden.',
                { giveawayData }
            );
        }

        const key = giveawayKey(guildId);
        const giveaways = await getGuildGiveaways(client, guildId);

        const giveawayMap = arrayToGiveawayMap(giveaways);
        giveawayMap[giveawayData.messageId] = giveawayData;
        
        await client.db.set(key, giveawayMap);
        
        logger.debug(`Saved giveaway ${giveawayData.messageId} in guild ${guildId}`);
        return true;
    } catch (error) {
        logger.error(`Error saving giveaway in guild ${guildId}:`, error);
        if (error instanceof NexoBotError) {
            throw error;
        }
        return false;
    }
}

export async function deleteGiveaway(client: NexoClient, guildId: string, messageId: string): Promise<boolean> {
    try {
        if (!client.db) {
            logger.warn('Database not available for deleteGiveaway');
            return false;
        }

        if (!messageId) {
            throw new NexoBotError(
                'Missing messageId parameter',
                ErrorTypes.VALIDATION,
                'Ein Giveaway kann ohne Nachrichten-ID nicht gelöscht werden.',
                { messageId }
            );
        }

        const key = giveawayKey(guildId);
        const giveaways = await getGuildGiveaways(client, guildId);

        const giveawayMap = arrayToGiveawayMap(giveaways);
        
        if (!giveawayMap[messageId]) {
            logger.debug(`Giveaway not found for deletion: ${messageId} in guild ${guildId}`);
            return false;
        }
        
        delete giveawayMap[messageId];
        await client.db.set(key, giveawayMap);
        
        logger.debug(`Deleted giveaway ${messageId} from guild ${guildId}`);
        return true;
    } catch (error) {
        logger.error(`Error deleting giveaway ${messageId} in guild ${guildId}:`, error);
        if (error instanceof NexoBotError) {
            throw error;
        }
        return false;
    }
}

export function createGiveawayEmbed(giveaway: Giveaway, status: string, winners: string[] = []) {
    try {
        return createGiveawayEmbedService(giveaway, status, winners);
    } catch (error) {
        logger.error('Error creating giveaway embed:', error);
        throw error;
    }
}

export function isGiveawayEnded(giveaway: Giveaway | null | undefined): boolean {
    if (!giveaway) return true;
    const endTime = giveaway.endsAt || giveaway.endTime;
    return Date.now() > endTime!;
}

export function pickWinners(entrants: string[], count: number): string[] {
    try {
        return selectWinnersService(entrants, count);
    } catch (error) {
        logger.error('Error picking winners:', error);
        
        if (!entrants || entrants.length === 0) return [];
        const requested = Math.min(count, entrants.length);
        const shuffled = [...entrants];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled.slice(0, requested);
    }
}

export function giveawayEmbed(giveaway: Giveaway, status: string, winners: string[] = []) {
    return createGiveawayEmbed(giveaway, status, winners);
}

export function giveawayButtons(ended = false) {
    try {
        return createGiveawayButtonsService(ended);
    } catch (error) {
        logger.error('Error creating giveaway buttons:', error);
        
        const row = new ActionRowBuilder<ButtonBuilder>();
        if (ended) {
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId('giveaway_reroll')
                    .setLabel('🎲 Neu auslosen')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('giveaway_view')
                    .setLabel('👁️ Gewinner anzeigen')
                    .setStyle(ButtonStyle.Primary)
            );
        } else {
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId('giveaway_join')
                    .setLabel('🎉 Teilnehmen')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('giveaway_end')
                    .setLabel('🛑 Beenden')
                    .setStyle(ButtonStyle.Danger)
            );
        }
        return row;
    }
}