import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { logger } from './logger.js';
import { TitanBotError, ErrorTypes } from './errorHandler.js';
import { unwrapReplitData } from './database.js';
import { 
    createGiveawayEmbed as createGiveawayEmbedService,
    createGiveawayButtons as createGiveawayButtonsService,
    selectWinners as selectWinnersService
} from '../services/giveawayService.js';

/**
 * Generate a consistent key for giveaways in the database
 * @param {string} guildId - The guild ID
 * @returns {string} The formatted key
 */
export function giveawayKey(guildId) {
    return `guild:${guildId}:giveaways`;
}

/**
 * Get all giveaways for a guild
 * @param {Object} client - The Discord client
 * @param {string} guildId - The guild ID
 * @returns {Promise<Array>} Array of giveaway data objects
 */
export async function getGuildGiveaways(client, guildId) {
    try {
        if (!client.db) {
            logger.warn('Database not available for getGuildGiveaways');
            return [];
        }

        const key = giveawayKey(guildId);
        const giveaways = await client.db.get(key, {});
        const unwrappedGiveaways = unwrapReplitData(giveaways);
        
        // Convert object to array for consistency
        if (typeof unwrappedGiveaways === 'object' && !Array.isArray(unwrappedGiveaways)) {
            return Object.values(unwrappedGiveaways || {});
        }
        return Array.isArray(unwrappedGiveaways) ? unwrappedGiveaways : [];
    } catch (error) {
        logger.error(`Error getting giveaways for guild ${guildId}:`, error);
        return [];
    }
}

/**
 * Save a giveaway
 * @param {Object} client - The Discord client
 * @param {string} guildId - The guild ID
 * @param {Object} giveawayData - The giveaway data to save
 * @returns {Promise<boolean>} Whether the operation was successful
 */
export async function saveGiveaway(client, guildId, giveawayData) {
    try {
        if (!client.db) {
            logger.warn('Database not available for saveGiveaway');
            return false;
        }

        if (!giveawayData || !giveawayData.messageId) {
            throw new TitanBotError(
                'Invalid giveaway data: missing messageId',
                ErrorTypes.VALIDATION,
                'Cannot save giveaway without a message ID.',
                { giveawayData }
            );
        }

        const key = giveawayKey(guildId);
        const giveaways = await getGuildGiveaways(client, guildId);
        
        // Convert array back to object for storage
        const giveawayMap = {};
        for (const ga of giveaways) {
            giveawayMap[ga.messageId] = ga;
        }
        
        giveawayMap[giveawayData.messageId] = giveawayData;
        await client.db.set(key, giveawayMap);
        
        logger.debug(`Saved giveaway ${giveawayData.messageId} in guild ${guildId}`);
        return true;
    } catch (error) {
        logger.error(`Error saving giveaway in guild ${guildId}:`, error);
        if (error instanceof TitanBotError) {
            throw error;
        }
        return false;
    }
}

/**
 * Delete a giveaway
 * @param {Object} client - The Discord client
 * @param {string} guildId - The guild ID
 * @param {string} messageId - The message ID of the giveaway to delete
 * @returns {Promise<boolean>} Whether the operation was successful
 */
export async function deleteGiveaway(client, guildId, messageId) {
    try {
        if (!client.db) {
            logger.warn('Database not available for deleteGiveaway');
            return false;
        }

        if (!messageId) {
            throw new TitanBotError(
                'Missing messageId parameter',
                ErrorTypes.VALIDATION,
                'Cannot delete giveaway without a message ID.',
                { messageId }
            );
        }

        const key = giveawayKey(guildId);
        const giveaways = await getGuildGiveaways(client, guildId);
        
        // Convert array to object
        const giveawayMap = {};
        for (const ga of giveaways) {
            giveawayMap[ga.messageId] = ga;
        }
        
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
        if (error instanceof TitanBotError) {
            throw error;
        }
        return false;
    }
}

/**
 * Create an embed for a giveaway
 * Delegates to service layer for consistency
 * @param {Object} giveaway - The giveaway data
 * @param {string} status - The status of the giveaway ('active', 'ended', 'reroll')
 * @param {Array<string>} [winners=[]] - Array of winner user IDs
 * @returns {EmbedBuilder} The formatted embed
 */
export function createGiveawayEmbed(giveaway, status, winners = []) {
    try {
        return createGiveawayEmbedService(giveaway, status, winners);
    } catch (error) {
        logger.error('Error creating giveaway embed:', error);
        throw error;
    }
}

/**
 * Check if a giveaway has ended
 * @param {Object} giveaway - The giveaway data
 * @returns {boolean} Whether the giveaway has ended
 */
export function isGiveawayEnded(giveaway) {
    if (!giveaway) return true;
    const endTime = giveaway.endsAt || giveaway.endTime;
    return Date.now() > endTime;
}

/**
 * Pick random winners from the entrants
 * Delegates to service layer for consistency
 * @param {Array<string>} entrants - Array of user IDs
 * @param {number} count - Number of winners to pick
 * @returns {Array<string>} Array of winner user IDs
 */
export function pickWinners(entrants, count) {
    try {
        return selectWinnersService(entrants, count);
    } catch (error) {
        logger.error('Error picking winners:', error);
        // Fallback to simple selection
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

/**
 * Create an embed for a giveaway (alias for createGiveawayEmbed)
 * @param {Object} giveaway - The giveaway data
 * @param {string} status - The status of the giveaway ('active', 'ended', 'reroll')
 * @param {Array<string>} [winners=[]] - Array of winner user IDs
 * @returns {EmbedBuilder} The formatted embed
 */
export function giveawayEmbed(giveaway, status, winners = []) {
    return createGiveawayEmbed(giveaway, status, winners);
}

/**
 * Create action row with giveaway buttons
 * Delegates to service layer for consistency
 * @param {boolean} ended - Whether the giveaway has ended
 * @returns {ActionRowBuilder} The action row with buttons
 */
export function giveawayButtons(ended = false) {
    try {
        return createGiveawayButtonsService(ended);
    } catch (error) {
        logger.error('Error creating giveaway buttons:', error);
        // Fallback button creation
        const row = new ActionRowBuilder();
        if (ended) {
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId('giveaway_reroll')
                    .setLabel('🎲 Reroll')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('giveaway_view')
                    .setLabel('👁️ View')
                    .setStyle(ButtonStyle.Primary)
            );
        } else {
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId('giveaway_join')
                    .setLabel('🎉 Join')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('giveaway_end')
                    .setLabel('🛑 End')
                    .setStyle(ButtonStyle.Danger)
            );
        }
        return row;
    }
}



