import { logger } from '../logger.js';
import { db } from './wrapper.js';
import { getPvpStatsKey, getPvpRecentKey } from './keys.js';

export { getPvpStatsKey, getPvpRecentKey } from './keys.js';

const MAX_RECENT_EVENTS = 20;

/**
 * Retrieve PvP stats for a specific player in a guild.
 * Returns { kills, deaths, lastKill, lastDeath } or a default object if not found.
 */
export async function getPvpStats(guildId, playerName) {
    if (!db.initialized) {
        await db.initialize();
    }

    const key = getPvpStatsKey(guildId, playerName);
    const data = await db.get(key);
    return data || { kills: 0, deaths: 0, lastKill: null, lastDeath: null };
}

/**
 * Save/update PvP stats for a player.
 */
export async function savePvpStats(guildId, playerName, data) {
    if (!db.initialized) {
        await db.initialize();
    }

    const key = getPvpStatsKey(guildId, playerName);
    await db.set(key, data);
}

/**
 * Record a kill for the killer and a death for the victim.
 * Also appends an entry to the recent-events list for the guild.
 */
export async function recordPvpKill(guildId, killerName, victimName) {
    try {
        if (!db.initialized) {
            await db.initialize();
        }

        const now = new Date().toISOString();

        // Update killer stats
        const killerStats = await getPvpStats(guildId, killerName);
        killerStats.kills = (killerStats.kills || 0) + 1;
        killerStats.lastKill = now;
        await savePvpStats(guildId, killerName, killerStats);

        // Update victim stats
        const victimStats = await getPvpStats(guildId, victimName);
        victimStats.deaths = (victimStats.deaths || 0) + 1;
        victimStats.lastDeath = now;
        await savePvpStats(guildId, victimName, victimStats);

        // Append to recent events list
        const recentKey = getPvpRecentKey(guildId);
        const recentData = (await db.get(recentKey)) || [];
        recentData.unshift({ killer: killerName, victim: victimName, timestamp: now });
        if (recentData.length > MAX_RECENT_EVENTS) {
            recentData.length = MAX_RECENT_EVENTS;
        }
        await db.set(recentKey, recentData);

        logger.info(`[PVP] Recorded kill: ${killerName} defeated ${victimName} in guild ${guildId}`);
    } catch (error) {
        logger.error(`[PVP] Error recording PvP kill in guild ${guildId}:`, error);
        throw error;
    }
}

/**
 * Retrieve recent PvP events for a guild (up to MAX_RECENT_EVENTS entries).
 */
export async function getRecentPvpEvents(guildId) {
    if (!db.initialized) {
        await db.initialize();
    }

    const key = getPvpRecentKey(guildId);
    return (await db.get(key)) || [];
}

/**
 * Retrieve all PvP stats for leaderboard calculation.
 * Uses the database list helper when available, otherwise returns an empty array.
 */
export async function getAllPvpStats(guildId) {
    try {
        if (!db.initialized) {
            await db.initialize();
        }

        const prefix = `guild:${guildId}:pvp:stats:`;

        if (typeof db.list !== 'function') {
            return [];
        }

        const keys = await db.list(prefix);
        const results = [];

        for (const key of keys) {
            const data = await db.get(key);
            if (data) {
                const playerName = key.replace(prefix, '');
                results.push({ playerName, ...data });
            }
        }

        return results;
    } catch (error) {
        logger.error(`[PVP] Error retrieving all PvP stats for guild ${guildId}:`, error);
        return [];
    }
}
