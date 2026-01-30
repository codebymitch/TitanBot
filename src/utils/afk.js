import { getAFKKey as getAFKKeyDb } from './database.js';

/**
 * Get the AFK status for a user in a guild
 * @param {Object} client - The Discord client
 * @param {string} guildId - The guild ID
 * @param {string} userId - The user ID
 * @returns {Promise<Object|null>} AFK data or null if not found
 */
export async function getAFKStatus(client, guildId, userId) {
    if (!client.db) {
        console.warn('Database not available for getAFKStatus');
        return null;
    }
    
    try {
        const key = getAFKKeyDb(guildId, userId);
        const data = await client.db.get(key);
        return data || null;
    } catch (error) {
        console.error(`Error getting AFK status for user ${userId} in guild ${guildId}:`, error);
        return null;
    }
}

/**
 * Set AFK status for a user in a guild
 * @param {Object} client - The Discord client
 * @param {string} guildId - The guild ID
 * @param {string} userId - The user ID
 * @param {string} reason - The AFK reason
 * @returns {Promise<boolean>} Whether the operation was successful
 */
export async function setAFKStatus(client, guildId, userId, reason = 'AFK') {
    if (!client.db) {
        console.warn('Database not available for setAFKStatus');
        return false;
    }
    
    try {
        const key = getAFKKeyDb(guildId, userId);
        const afkData = {
            reason,
            timestamp: Date.now(),
            guildId,
            userId
        };
        await client.db.set(key, afkData);
        return true;
    } catch (error) {
        console.error(`Error setting AFK status for user ${userId} in guild ${guildId}:`, error);
        return false;
    }
}

/**
 * Remove AFK status for a user in a guild
 * @param {Object} client - The Discord client
 * @param {string} guildId - The guild ID
 * @param {string} userId - The user ID
 * @returns {Promise<boolean>} Whether the operation was successful
 */
export async function removeAFKStatus(client, guildId, userId) {
    if (!client.db) {
        console.warn('Database not available for removeAFKStatus');
        return false;
    }
    
    try {
        const key = getAFKKeyDb(guildId, userId);
        await client.db.delete(key);
        return true;
    } catch (error) {
        console.error(`Error removing AFK status for user ${userId} in guild ${guildId}:`, error);
        return false;
    }
}

/**
 * Get the AFK key for a user in a guild
 * @param {string} guildId - The guild ID
 * @param {string} userId - The user ID
 * @returns {string} The AFK key
 */
export function getAFKKey(guildId, userId) {
    return `afk:${guildId}:${userId}`;
}
