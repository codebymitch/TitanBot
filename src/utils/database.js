import { pgDb } from './postgresDatabase.js';
import { MemoryStorage } from './memoryStorage.js';
import { logger } from './logger.js';
import { BotConfig } from '../config/bot.js';
import { normalizeGuildConfig } from './schemas.js';
import { DEFAULT_GUILD_CONFIG } from './constants.js';

class DatabaseWrapper {
    constructor() {
        this.initialized = false;
        this.db = null;
        this.useFallback = false;
        this.connectionType = 'none';
        this.degradedModeWarningShown = false;
    }

    async initialize() {
        if (this.initialized) {
            return;
        }

        try {
            logger.info('Attempting to connect to PostgreSQL...');
            const pgConnected = await pgDb.connect();
            if (pgConnected) {
                this.db = pgDb;
                this.connectionType = 'postgresql';
                logger.info('✅ PostgreSQL Database initialized - using persistent database');
                this.initialized = true;
                return;
            }
        } catch (error) {
            logger.warn('PostgreSQL connection failed:', error.message);
        }

        
        this.db = new MemoryStorage();
        this.useFallback = true;
        this.connectionType = 'memory';
        logger.warn('⚠️  DATABASE DEGRADED MODE ENABLED - Using in-memory storage (data will be lost on restart)');
        logger.warn('⚠️  Please check PostgreSQL connection and restart the bot when fixed');
        this.initialized = true;
        this.degradedModeWarningShown = true;
    }

    async set(key, value, ttl = null) {
        if (this.useFallback) {
            logger.debug(`[DEGRADED] Writing to memory: ${key}`);
        }
        return this.db.set(key, value, ttl);
    }

    async get(key, defaultValue = null) {
        return this.db.get(key, defaultValue);
    }

    async delete(key) {
        if (this.useFallback) {
            logger.debug(`[DEGRADED] Deleting from memory: ${key}`);
        }
        return this.db.delete(key);
    }

    async list(prefix) {
        return this.db.list(prefix);
    }

    async exists(key) {
        if (this.db.exists) {
            return this.db.exists(key);
        }
        const value = await this.db.get(key);
        return value !== null;
    }

    async increment(key, amount = 1) {
        if (this.useFallback) {
            logger.debug(`[DEGRADED] Incrementing in memory: ${key}`);
        }
        if (this.db.increment) {
            return this.db.increment(key, amount);
        }
        const current = await this.db.get(key, 0);
        const newValue = current + amount;
        await this.db.set(key, newValue);
        return newValue;
    }

    async decrement(key, amount = 1) {
        if (this.useFallback) {
            logger.debug(`[DEGRADED] Decrementing in memory: ${key}`);
        }
        if (this.db.decrement) {
            return this.db.decrement(key, amount);
        }
        const current = await this.db.get(key, 0);
        const newValue = current - amount;
        await this.db.set(key, newValue);
        return newValue;
    }

    /**
     * Check if database is in degraded mode (memory-only fallback)
     * @returns {boolean} True if using in-memory storage fallback
     */
    isDegraded() {
        return this.useFallback;
    }

    /**
     * Check if database is fully available (PostgreSQL)
     * @returns {boolean} True if connected to PostgreSQL
     */
    isAvailable() {
        return this.db && !this.useFallback;
    }

    



    getStatus() {
        return {
            initialized: this.initialized,
            connectionType: this.connectionType,
            isDegraded: this.useFallback,
            isAvailable: this.isAvailable()
        };
    }

    getConnectionType() {
        return this.connectionType;
    }
}

export const db = new DatabaseWrapper();

export async function initializeDatabase() {
    try {
        logger.info("Initializing Database (PostgreSQL > Memory fallback)...");
        await db.initialize();
        logger.info("✅ Database initialized");
        return { db };
    } catch (error) {
        logger.error("❌ Database Initialization Error:", error);
        return { db };
    }
}

export async function getFromDb(key, defaultValue = null) {
    try {
        const value = await db.get(key);
        return value === null ? defaultValue : value;
    } catch (error) {
        logger.error(`Error getting value for key ${key}:`, error);
        return defaultValue;
    }
}

export async function setInDb(key, value, ttl = null) {
    try {
        await db.set(key, value, ttl);
        return true;
    } catch (error) {
        logger.error(`Error setting value for key ${key}:`, error);
        return false;
    }
}

export async function deleteFromDb(key) {
    try {
        await db.delete(key);
        return true;
    } catch (error) {
        logger.error(`Error deleting key ${key}:`, error);
        return false;
    }
}

export async function insertVerificationAudit(record) {
    try {
        if (!db.initialized) {
            await db.initialize();
        }

        if (db.isAvailable() && typeof pgDb.insertVerificationAudit === 'function') {
            return await pgDb.insertVerificationAudit(record);
        }

        const key = `verification:audit:${record.guildId}`;
        const existing = await getFromDb(key, []);
        const auditEntries = Array.isArray(existing) ? existing : [];
        const maxInMemoryAuditEntries = BotConfig?.verification?.maxInMemoryAuditEntries ?? 1000;

        auditEntries.push({
            ...record,
            createdAt: record.createdAt || new Date().toISOString()
        });

        if (auditEntries.length > maxInMemoryAuditEntries) {
            auditEntries.splice(0, auditEntries.length - maxInMemoryAuditEntries);
        }

        await setInDb(key, auditEntries);
        return true;
    } catch (error) {
        logger.error('Error storing verification audit:', error);
        return false;
    }
}

/**
 * Extract actual data from database response (for backward compatibility)
 * @param {any} data - Data to unwrap
 * @returns {any} Unwrapped data
 */
export function unwrapReplitData(data) {
    if (
        typeof data === "object" &&
        data !== null &&
        data.ok !== undefined &&
        data.value !== undefined
    ) {
        return unwrapReplitData(data.value);
    }
    return data;
}

export const getGuildConfigKey = (guildId) => `guild:${guildId}:config`;
export const getGuildBirthdaysKey = (guildId) => `guild:${guildId}:birthdays`;

/**
 * Get or initialize guild configuration
 * @param {Object} client - Discord client with database
 * @param {string} guildId - Guild ID
 * @returns {Promise<Object>} Guild configuration
 */
export async function getGuildConfig(client, guildId) {
    try {
        if (!client.db || typeof client.db.get !== "function") {
            return {};
        }

        const configKey = getGuildConfigKey(guildId);
        const rawConfig = await client.db.get(configKey, {});
        const cleanedConfig = unwrapReplitData(rawConfig);

        return normalizeGuildConfig(cleanedConfig, DEFAULT_GUILD_CONFIG);
    } catch (error) {
        logger.error(`Error fetching config for guild ${guildId}`, error);
        return {};
    }
}

/**
 * Save guild configuration
 * @param {Object} client - Discord client with database
 * @param {string} guildId - Guild ID
 * @param {Object} config - Configuration to save
 * @returns {Promise<boolean>} Success status
 */
export async function setGuildConfig(client, guildId, config) {
    try {
        if (!client.db || typeof client.db.set !== "function") {
            logger.error("Database client is not available for setGuildConfig");
            return false;
        }

        const key = getGuildConfigKey(guildId);
        await client.db.set(key, config);
        return true;
    } catch (error) {
        logger.error(`Error saving config for guild ${guildId}`, error);
        return false;
    }
}

export { DatabaseWrapper, pgDb };

export const getMessage = (key, replacements = {}) => {
    let message = BotConfig.messages[key] || key;
    for (const [k, v] of Object.entries(replacements)) {
        message = message.replace(new RegExp(`\\{${k}\\}`, "g"), v);
    }
    return message;
};

export const getColor = (path, fallback = "#000000") => {
    const parts = path.split(".");
    let current = BotConfig.embeds.colors;

    for (const part of parts) {
        if (current[part] === undefined) {
            console.warn(`Color path '${path}' not found in config, using fallback`);
            return fallback;
        }
        current = current[part];
    }

    return typeof current === "string" ? current : fallback;
};

/**
 * Get all birthdays for a guild
 * @param {Object} client - Discord client with database
 * @param {string} guildId - Guild ID
 * @returns {Promise<Object>} Object mapping user IDs to birthday data
 */
export async function getGuildBirthdays(client, guildId) {
    const key = getGuildBirthdaysKey(guildId);
    try {
        if (!client.db || typeof client.db.get !== "function") {
            console.error("Database client is not available for getGuildBirthdays.");
            return {};
        }

        const rawData = await client.db.get(key, {});
        return unwrapReplitData(rawData) || {};
    } catch (error) {
        console.error(`Error retrieving birthdays for guild ${guildId}:`, error);
        return {};
    }
}

/**
 * Set a user's birthday
 * @param {Object} client - Discord client with database
 * @param {string} guildId - Guild ID
 * @param {string} userId - User ID
 * @param {number} month - Month (1-12)
 * @param {number} day - Day (1-31)
 * @returns {Promise<boolean>} Success status
 */
export async function setBirthday(client, guildId, userId, month, day) {
    try {
        if (!client.db || typeof client.db.set !== "function") {
            console.error("Database client is not available for setBirthday.");
            return false;
        }

        const key = getGuildBirthdaysKey(guildId);
        const birthdays = await getGuildBirthdays(client, guildId);
        birthdays[userId] = { month, day };
        await client.db.set(key, birthdays);
        return true;
    } catch (error) {
        console.error(`Error setting birthday for user ${userId} in guild ${guildId}:`, error);
        return false;
    }
}

/**
 * Delete a user's birthday
 * @param {Object} client - Discord client with database
 * @param {string} guildId - Guild ID
 * @param {string} userId - User ID
 * @returns {Promise<boolean>} Success status
 */
export async function deleteBirthday(client, guildId, userId) {
    try {
        if (!client.db || typeof client.db.set !== "function") {
            console.error("Database client is not available for deleteBirthday.");
            return false;
        }

        const key = getGuildBirthdaysKey(guildId);
        const birthdays = await getGuildBirthdays(client, guildId);
        if (birthdays[userId]) {
            delete birthdays[userId];
            await client.db.set(key, birthdays);
        }
        return true;
    } catch (error) {
        console.error(`Error deleting birthday for user ${userId} in guild ${guildId}:`, error);
        return false;
    }
}






export function getMonthName(monthNum) {
    const months = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ];
    const index = Math.max(0, Math.min(monthNum - 1, 11));
    return monthNum >= 1 && monthNum <= 12 ? months[index] : 'Invalid Month';
}


/**
 * Get all giveaways for a guild
 * @param {Object} client - Discord client with database
 * @param {string} guildId - Guild ID
 * @returns {Promise<Object>} Object mapping message IDs to giveaway data
 */
export async function getGuildGiveaways(client, guildId) {
    const key = giveawayKey(guildId);
    try {
        if (!client.db || typeof client.db.get !== "function") {
            console.error("Database client is not available for getGuildGiveaways.");
            return {};
        }

        const giveaways = await client.db.get(key, {});
        return unwrapReplitData(giveaways) || {};
    } catch (error) {
        console.error(`Error getting giveaways for guild ${guildId}:`, error);
        return {};
    }
}

/**
 * Save a giveaway
 * @param {Object} client - Discord client with database
 * @param {string} guildId - Guild ID
 * @param {Object} giveawayData - The giveaway data to save
 * @returns {Promise<boolean>} Success status
 */
export async function saveGiveaway(client, guildId, giveawayData) {
    try {
        if (!client.db || typeof client.db.set !== "function") {
            console.error("Database client is not available for saveGiveaway.");
            return false;
        }

        const key = giveawayKey(guildId);
        const giveaways = await getGuildGiveaways(client, guildId);
        
        giveaways[giveawayData.messageId] = giveawayData;
        
        await client.db.set(key, giveaways);
        return true;
    } catch (error) {
        console.error('Error saving giveaway:', error);
        return false;
    }
}

/**
 * Delete a giveaway
 * @param {Object} client - Discord client with database
 * @param {string} guildId - Guild ID
 * @param {string} messageId - The message ID of the giveaway to delete
 * @returns {Promise<boolean>} Success status
 */
export async function deleteGiveaway(client, guildId, messageId) {
    try {
        const key = giveawayKey(guildId);
        const giveaways = await getGuildGiveaways(client, guildId);
        
        if (giveaways[messageId]) {
            delete giveaways[messageId];
            await client.db.set(key, giveaways);
            return true;
        }
        return false;
    } catch (error) {
        console.error('Error deleting giveaway:', error);
        return false;
    }
}

/**
 * Get all giveaways that have ended (SQL-optimized for PostgreSQL)
 * Uses the giveaways table index on ends_at for efficient querying
 * @param {Object} client - Discord client with database
 * @returns {Promise<Array>} Array of ended giveaway records
 */
export async function getEndedGiveaways(client) {
    try {
        if (!client.db || !client.db.isAvailable()) {
            logger.warn('Database not available for getEndedGiveaways, using fallback');
            return [];
        }

        const { pgDb } = await import('./postgresDatabase.js');
        const { pgConfig } = await import('../config/postgres.js');
        
        if (!pgDb.isAvailable()) {
            return [];
        }

        const result = await pgDb.pool.query(
            `SELECT id, guild_id, message_id, data, ends_at 
             FROM ${pgConfig.tables.giveaways} 
             WHERE ends_at <= NOW() 
             AND (data->>'ended')::boolean = false
             ORDER BY ends_at ASC`
        );

        return result.rows || [];
    } catch (error) {
        logger.error('Error getting ended giveaways:', error);
        return [];
    }
}

/**
 * Mark a giveaway as ended in the database
 * @param {Object} client - Discord client with database
 * @param {number} giveawayId - The giveaway ID from the database
 * @param {Object} endedData - The updated giveaway data to save
 * @returns {Promise<boolean>} Success status
 */
export async function markGiveawayEnded(client, giveawayId, endedData) {
    try {
        if (!client.db || !client.db.isAvailable()) {
            logger.warn('Database not available for markGiveawayEnded');
            return false;
        }

        const { pgDb } = await import('./postgresDatabase.js');
        const { pgConfig } = await import('../config/postgres.js');
        
        if (!pgDb.isAvailable()) {
            return false;
        }

        await pgDb.pool.query(
            `UPDATE ${pgConfig.tables.giveaways} 
             SET data = $1, updated_at = NOW() 
             WHERE id = $2`,
            [endedData, giveawayId]
        );

        return true;
    } catch (error) {
        logger.error('Error marking giveaway as ended:', error);
        return false;
    }
}

/**
 * Generate a consistent key for giveaways in the database
 * @param {string} guildId - The guild ID
 * @returns {string} The formatted key
 */
export function giveawayKey(guildId) {
    return `guild:${guildId}:giveaways`;
}







export function getEconomyKey(guildId, userId) {
    return `guild:${guildId}:economy:${userId}`;
}







export function getAFKKey(guildId, userId) {
    return `guild:${guildId}:afk:${userId}`;
}






export function getWelcomeConfigKey(guildId) {
    return `guild:${guildId}:welcome`;
}

function normalizeWelcomeConfig(raw = {}) {
    const base = typeof raw === "object" && raw !== null ? raw : {};

    const channelId = base.channelId ?? null;
    const goodbyeChannelId = base.goodbyeChannelId ?? null;

    const welcomeMessage = base.welcomeMessage ?? "Welcome {user} to {server}!";
    const leaveMessage = base.leaveMessage ?? "{user.tag} has left the server.";

    const welcomeEmbed = base.welcomeEmbed ?? {
        title: "🎉 Welcome!",
        description: "Welcome {user} to {server}!",
        color: getColor("success"),
        thumbnail: true,
        footer: "Welcome to {server}!"
    };

    const leaveEmbed = base.leaveEmbed ?? {
        title: "👋 Goodbye",
        description: "{user.tag} has left the server.",
        color: getColor("error"),
        thumbnail: true,
        footer: "Goodbye from {server}!"
    };

    const roleIds = Array.isArray(base.roleIds) ? base.roleIds : [];

    return {
        ...base,
        enabled: Boolean(base.enabled),
        channelId,
        welcomeMessage,
        welcomeEmbed,
        welcomePing: Boolean(base.welcomePing),
        welcomeImage: base.welcomeImage ?? null,
        goodbyeEnabled: Boolean(base.goodbyeEnabled),
        goodbyeChannelId,
        leaveMessage,
        leaveEmbed,
        dmMessage: base.dmMessage ?? "",
        roleIds,
        autoRoleDelay: base.autoRoleDelay ?? 0,
        joinLogs: base.joinLogs ?? { enabled: false, channelId: null },
        leaveLogs: base.leaveLogs ?? { enabled: false, channelId: null }
    };
}







export async function getWelcomeConfig(client, guildId) {
    if (!client.db) {
        console.warn('Database not available for getWelcomeConfig');
        return normalizeWelcomeConfig();
    }
    
    const key = getWelcomeConfigKey(guildId);
    try {
        const config = await client.db.get(key, {});
        const unwrapped = unwrapReplitData(config);
        return normalizeWelcomeConfig(unwrapped);
    } catch (error) {
        console.error(`Error getting welcome config for guild ${guildId}:`, error);
        return normalizeWelcomeConfig();
    }
}








export async function saveWelcomeConfig(client, guildId, config) {
    const key = getWelcomeConfigKey(guildId);
    try {
        const existingConfig = await getWelcomeConfig(client, guildId);
        const mergedConfig = { ...existingConfig, ...config };
        
        await client.db.set(key, mergedConfig);
        return true;
    } catch (error) {
        console.error(`Error saving welcome config for guild ${guildId}:`, error);
        return false;
    }
}








export async function updateWelcomeConfig(client, guildId, updates) {
    try {
        const currentConfig = await getWelcomeConfig(client, guildId);
        const updatedConfig = { ...currentConfig, ...updates };
        
        await saveWelcomeConfig(client, guildId, updatedConfig);
        return updatedConfig;
    } catch (error) {
        console.error(`Error updating welcome config for guild ${guildId}:`, error);
        throw error;
    }
}







export function getLevelingKey(guildId) {
    return `guild:${guildId}:leveling:config`;
}







export function getUserLevelKey(guildId, userId) {
    return `guild:${guildId}:leveling:users:${userId}`;
}







export async function getLevelingConfig(client, guildId) {
    const key = getLevelingKey(guildId);
    try {
        const config = await getFromDb(key, {
            enabled: false,
            xpPerMessage: 10,
            xpPerMinute: 60,
            cooldownEnabled: true,
            messageLengthMultiplier: true,
            levelUpMessages: true,
            levelUpChannel: null,
            roles: {},
            milestones: {}
        });
        
        return config;
    } catch (error) {
        logger.error('Error getting leveling config:', error);
        return {
            enabled: false,
            xpPerMessage: 10,
            xpPerMinute: 60,
            cooldownEnabled: true,
            messageLengthMultiplier: true,
            levelUpMessages: true,
            levelUpChannel: null,
            roles: {},
            milestones: {}
        };
    }
}








export async function saveLevelingConfig(client, guildId, config) {
    const key = getLevelingKey(guildId);
    try {
        await setInDb(key, config);
        
        if (process.env.NODE_ENV !== 'production') {
            logger.debug(`💾 Saved leveling config to database (guild: ${guildId})`);
        }
        return true;
    } catch (error) {
        logger.error(`Error saving leveling config for guild ${guildId}:`, error);
        return false;
    }
}








export async function getUserLevelData(client, guildId, userId) {
    const key = getUserLevelKey(guildId, userId);
    try {
        const data = await getFromDb(key, null);
        if (!data) {
            return {
                xp: 0,
                level: 0,
                totalXp: 0,
                lastMessage: 0,
                rank: 0,
                xpToNextLevel: getXpForLevel(1)
            };
        }
        
        const levelData = {
            xp: data.xp || 0,
            level: data.level || 0,
            totalXp: data.totalXp || 0,
            lastMessage: data.lastMessage || 0,
            rank: data.rank || 0,
            xpToNextLevel: getXpForLevel((data.level || 0) + 1)
        };
        
        return levelData;
    } catch (error) {
        console.error(`Error getting level data for user ${userId} in guild ${guildId}:`, error);
        return {
            xp: 0,
            level: 0,
            totalXp: 0,
            lastMessage: 0,
            rank: 0,
            xpToNextLevel: getXpForLevel(1)
        };
    }
}









export async function saveUserLevelData(client, guildId, userId, data) {
    const key = getUserLevelKey(guildId, userId);
    try {
        const levelData = {
            ...data,
            xp: data.xp || 0,
            level: data.level || 0,
            totalXp: data.totalXp || 0,
            lastMessage: data.lastMessage || 0,
            rank: data.rank || 0,
            updatedAt: Date.now()
        };
        
        await setInDb(key, levelData);
        return true;
    } catch (error) {
        console.error(`Error saving level data for user ${userId} in guild ${guildId}:`, error);
        return false;
    }
}






export function getXpForLevel(level) {
    return 5 * Math.pow(level, 2) + 50 * level + 50;
}








export async function getLeaderboard(client, guildId, limit = 10) {
    try {
        if (!client.db || typeof client.db.list !== "function") {
            console.error("Database client is not available for getLeaderboard.");
            return [];
        }

        const prefix = `guild:${guildId}:leveling:users:`;
        let keys = await client.db.list(prefix);
        
        if (!Array.isArray(keys)) {
            if (typeof keys === 'object' && keys !== null) {
                keys = Object.keys(keys).filter(key => key.startsWith(prefix));
            } else {
                return [];
            }
        }
        
        if (keys.length === 0) {
            return [];
        }
        
        const userDataPromises = keys.map(async (key) => {
            try {
                const userId = key.replace(prefix, '');
                const data = await client.db.get(key);
                if (!data) return null;
                
                const unwrapped = unwrapReplitData(data);
                return {
                    userId,
                    xp: unwrapped.xp || 0,
                    level: unwrapped.level || 0,
                    totalXp: unwrapped.totalXp || 0,
rank: 0
                };
            } catch (error) {
                console.error(`Error processing leaderboard key ${key}:`, error);
                return null;
            }
        });
        
        let userData = (await Promise.all(userDataPromises)).filter(Boolean);
        
        userData.sort((a, b) => (b.totalXp || 0) - (a.totalXp || 0));
        
        userData = userData.map((user, index) => ({
            ...user,
            rank: index + 1
        }));
        
        return userData.slice(0, limit);
    } catch (error) {
        console.error(`Error getting leaderboard for guild ${guildId}:`, error);
        return [];
    }
}







export function getApplicationRolesKey(guildId) {
    return `guild:${guildId}:applications:roles`;
}







export async function getApplicationRoles(client, guildId) {
    try {
        if (!client.db || typeof client.db.get !== "function") {
            console.error("Database client is not available for getApplicationRoles.");
            return [];
        }

        const key = getApplicationRolesKey(guildId);
        const roles = await client.db.get(key, []);
        const unwrappedRoles = unwrapReplitData(roles);
        return Array.isArray(unwrappedRoles) ? unwrappedRoles : [];
    } catch (error) {
        console.error(`Error getting application roles for guild ${guildId}:`, error);
        return [];
    }
}








export async function saveApplicationRoles(client, guildId, roles) {
    try {
        if (!client.db || typeof client.db.set !== "function") {
            console.error("Database client is not available for saveApplicationRoles.");
            return false;
        }

        const key = getApplicationRolesKey(guildId);
        await client.db.set(key, roles);
        return true;
    } catch (error) {
        console.error(`Error saving application roles for guild ${guildId}:`, error);
        return false;
    }
}






export function getApplicationSettingsKey(guildId) {
    return `guild:${guildId}:applications:settings`;
}







export function getUserApplicationsKey(guildId, userId) {
    return `guild:${guildId}:applications:users:${userId}`;
}







export function getApplicationKey(guildId, applicationId) {
    return `guild:${guildId}:applications:${applicationId}`;
}







export async function getApplicationSettings(client, guildId) {
    if (!client.db) {
        console.warn('Database not available for getApplicationSettings');
        return {
            enabled: false,
            applicationChannelId: null,
            logChannelId: null,
            questions: [
                "Why do you want to join our staff team?",
                "What experience do you have that would make you a good fit?",
                "How much time can you dedicate to this role?"
            ]
        };
    }
    
    const key = getApplicationSettingsKey(guildId);
    try {
        const settings = await client.db.get(key, {});
        const unwrapped = unwrapReplitData(settings);
        
        const defaultSettings = {
            enabled: false,
            applicationChannelId: null,
            logChannelId: null,
            questions: [
                "Why do you want to join our staff team?",
                "What experience do you have that would make you a good fit?",
                "How much time can you dedicate to this role?"
            ],
            roles: {
                admin: null,
                reviewer: null,
                accepted: null,
                denied: null
            },
            requiredRoles: [],
            deniedRoles: [],
minAccountAge: 0,
            maxApplications: 1,
cooldown: 7,
            allowMultipleApplications: false,
            requireVerification: false,
            customWelcomeMessage: ""
        };
        
        return { ...defaultSettings, ...unwrapped };
    } catch (error) {
        console.error(`Error getting application settings for guild ${guildId}:`, error);
        return {
            enabled: false,
            applicationChannelId: null,
            logChannelId: null,
            questions: [
                "Why do you want to join our staff team?",
                "What experience do you have that would make you a good fit?",
                "How much time can you dedicate to this role?"
            ],
            roles: {
                admin: null,
                reviewer: null,
                accepted: null,
                denied: null
            },
            requiredRoles: [],
            deniedRoles: [],
            minAccountAge: 0,
            maxApplications: 1,
            cooldown: 7,
            allowMultipleApplications: false,
            requireVerification: false,
            customWelcomeMessage: ""
        };
    }
}








export async function saveApplicationSettings(client, guildId, settings) {
    const key = getApplicationSettingsKey(guildId);
    try {
        const existingSettings = await getApplicationSettings(client, guildId);
        const mergedSettings = { ...existingSettings, ...settings };
        
        await client.db.set(key, mergedSettings);
        return true;
    } catch (error) {
        console.error(`Error saving application settings for guild ${guildId}:`, error);
        return false;
    }
}







export async function createApplication(client, application) {
    const { guildId, userId } = application;
    const applicationId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const key = getApplicationKey(guildId, applicationId);
    
    const newApplication = {
        ...application,
        id: applicationId,
status: 'pending',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        reviewedBy: null,
        reviewedAt: null,
        notes: []
    };
    
    try {
        if (!client.db || typeof client.db.set !== "function") {
            console.error("Database client is not available for createApplication.");
            throw new Error("Database not available");
        }

        await client.db.set(key, newApplication);
        
        const userKey = getUserApplicationsKey(guildId, userId);
        const userApplications = await client.db.get(userKey, []);
        const unwrappedApplications = unwrapReplitData(userApplications);
        
        const applicationsArray = Array.isArray(unwrappedApplications) ? unwrappedApplications : [];
        applicationsArray.push(applicationId);
        
        await client.db.set(userKey, applicationsArray);
        if (process.env.NODE_ENV !== 'production') {
            logger.debug(`Successfully created application ${applicationId} for user ${userId}`);
        }
        
        return newApplication;
    } catch (error) {
        console.error(`Error creating application for user ${userId} in guild ${guildId}:`, error);
        throw error;
    }
}








export async function getApplication(client, guildId, applicationId) {
    const key = getApplicationKey(guildId, applicationId);
    try {
        const application = await client.db.get(key, null);
        return unwrapReplitData(application);
    } catch (error) {
        console.error(`Error getting application ${applicationId} in guild ${guildId}:`, error);
        return null;
    }
}









export async function updateApplication(client, guildId, applicationId, updates) {
    const key = getApplicationKey(guildId, applicationId);
    try {
        const existingApplication = await getApplication(client, guildId, applicationId);
        if (!existingApplication) {
            throw new Error(`Application ${applicationId} not found`);
        }
        
        const updatedApplication = {
            ...existingApplication,
            ...updates,
            updatedAt: Date.now()
        };
        
        await client.db.set(key, updatedApplication);
        return updatedApplication;
    } catch (error) {
        console.error(`Error updating application ${applicationId} in guild ${guildId}:`, error);
        throw error;
    }
}








export async function getUserApplications(client, guildId, userId) {
    const userKey = getUserApplicationsKey(guildId, userId);
    try {
        if (!client.db || typeof client.db.get !== "function") {
            console.error("Database client is not available for getUserApplications.");
            return [];
        }

        const applicationIds = await client.db.get(userKey, []);
        const unwrappedIds = unwrapReplitData(applicationIds);
        
        const idsArray = Array.isArray(unwrappedIds) ? unwrappedIds : [];
        
        const applicationPromises = idsArray.map(id => 
            getApplication(client, guildId, id)
        );
        
        const applications = await Promise.all(applicationPromises);
        return applications.filter(Boolean);
    } catch (error) {
        console.error(`Error getting applications for user ${userId} in guild ${guildId}:`, error);
        return [];
    }
}












export async function getApplications(client, guildId, filters = {}) {
    const {
        status,
        userId,
        limit = 50,
        offset = 0
    } = filters;
    
    try {
        if (!client.db || typeof client.db.list !== "function") {
            console.error("Database client is not available for getApplications.");
            return [];
        }

        const prefix = `guild:${guildId}:applications:`;
        let keys = await client.db.list(prefix);
        
        if (!Array.isArray(keys)) {
            if (typeof keys === 'object' && keys !== null) {
                const keyArray = Object.keys(keys).filter(key => key.startsWith(prefix));
                keys = keyArray;
            } else {
                return [];
            }
        }
        
        const applicationKeys = keys.filter(key => !key.endsWith('settings') && key.includes('applications:'));
        
        const applicationPromises = applicationKeys.map(key => client.db.get(key));
        let applications = (await Promise.all(applicationPromises))
            .map(unwrapReplitData)
            .filter(Boolean);
        
        if (status) {
            applications = applications.filter(app => app.status === status);
        }
        
        if (userId) {
            applications = applications.filter(app => app.userId === userId);
        }
        
        applications.sort((a, b) => b.createdAt - a.createdAt);
        
        return applications.slice(offset, offset + limit);
    } catch (error) {
        console.error(`Error getting applications for guild ${guildId}:`, error);
        return [];
    }
}







export function getModlogSettingsKey(guildId) {
    return `guild:${guildId}:modlog:settings`;
}







export function getModlogEntryKey(guildId, caseId) {
    return `guild:${guildId}:modlog:cases:${caseId}`;
}







export function getUserModlogKey(guildId, userId) {
    return `guild:${guildId}:modlog:users:${userId}`;
}







export async function getModlogSettings(client, guildId) {
    const key = getModlogSettingsKey(guildId);
    try {
        const settings = await client.db.get(key, {});
        const unwrapped = unwrapReplitData(settings);
        
        const defaultSettings = {
            enabled: false,
            channelId: null,
            ignoredChannels: [],
            ignoredUsers: [],
            ignoredActions: [],
            logBans: true,
            logKicks: true,
            logMutes: true,
            logWarns: true,
            logMessageDeletes: false,
            logMessageEdits: false,
            logChannelUpdates: true,
            logMemberUpdates: true,
            logRoleUpdates: true,
            logVoiceUpdates: true,
            logEmojiUpdates: true,
            logStickerUpdates: true,
            logInviteCreates: true,
            logInviteDeletes: true,
            logWebhookUpdates: true,
            logIntegrationUpdates: true,
            logBotActions: true,
            logPunishments: true,
            logJoins: true,
            logLeaves: true,
            logNicknameChanges: true,
            logRoleChanges: true,
            logTimeoutAdds: true,
            logTimeoutRemovals: true,
            logThreadCreates: true,
            logThreadDeletes: true,
            logThreadUpdates: true,
            logScheduledEvents: true,
            logAutomod: true,
            logStages: true,
            logGuildUpdates: true,
            logEmojiRoleUpdates: true,
            logStickerRoleUpdates: true,
            logStickerUpdates: true,
            logIntegrationRoleUpdates: true,
            logWebhookRoleUpdates: true,
            logAutoModRuleUpdates: true,
            logAutoModExecutions: true,
            logScheduledEventUpdates: true,
            logScheduledEventUsers: true,
            logScheduledEventCreates: true,
            logScheduledEventDeletes: true,
            logScheduledEventUserAdds: true,
            logScheduledEventUserRemoves: true,
            logThreadMembers: true,
            logThreadMembersUpdates: true,
            logGuildScheduledEvents: true,
            logGuildScheduledEventUsers: true,
            logGuildScheduledEventCreates: true,
            logGuildScheduledEventDeletes: true,
            logGuildScheduledEventUserAdds: true,
            logGuildScheduledEventUserRemoves: true,
            logGuildScheduledEventUpdates: true,
            logGuildScheduledEventUserUpdates: true,
            logGuildScheduledEventUserAdd: true,
            logGuildScheduledEventUserRemove: true,
            logGuildScheduledEventUserUpdate: true,
            logGuildScheduledEventCreate: true,
            logGuildScheduledEventDelete: true,
            logGuildScheduledEventUpdate: true,
            logGuildScheduledEventUserAdds: true,
            logGuildScheduledEventUserRemoves: true,
            logGuildScheduledEventUserUpdates: true,
            logGuildScheduledEventUsersAdd: true,
            logGuildScheduledEventUsersRemove: true,
            logGuildScheduledEventUsersUpdate: true,
            logGuildScheduledEventUserAdd: true,
            logGuildScheduledEventUserRemove: true,
            logGuildScheduledEventUserUpdate: true,
            logGuildScheduledEventUsersAdd: true,
            logGuildScheduledEventUsersRemove: true,
            logGuildScheduledEventUsersUpdate: true,
            logGuildScheduledEventUserAdd: true,
            logGuildScheduledEventUserRemove: true,
            logGuildScheduledEventUserUpdate: true,
            logGuildScheduledEventUsersAdd: true,
            logGuildScheduledEventUsersRemove: true,
            logGuildScheduledEventUsersUpdate: true,
            logGuildScheduledEventUserAdd: true,
            logGuildScheduledEventUserRemove: true,
            logGuildScheduledEventUserUpdate: true,
            logGuildScheduledEventUsersAdd: true,
            logGuildScheduledEventUsersRemove: true,
            logGuildScheduledEventUsersUpdate: true
        };
        
        return { ...defaultSettings, ...unwrapped };
    } catch (error) {
        console.error(`Error getting modlog settings for guild ${guildId}:`, error);
        return {
            enabled: false,
            channelId: null,
            ignoredChannels: [],
            ignoredUsers: [],
            ignoredActions: [],
            logBans: true,
            logKicks: true,
            logMutes: true,
            logWarns: true,
            logMessageDeletes: false,
            logMessageEdits: false,
            logChannelUpdates: true,
            logMemberUpdates: true,
            logRoleUpdates: true,
            logVoiceUpdates: true,
            logEmojiUpdates: true,
            logStickerUpdates: true,
            logInviteCreates: true,
            logInviteDeletes: true,
            logWebhookUpdates: true,
            logIntegrationUpdates: true,
            logBotActions: true,
            logPunishments: true,
            logJoins: true,
            logLeaves: true,
            logNicknameChanges: true,
            logRoleChanges: true,
            logTimeoutAdds: true,
            logTimeoutRemovals: true
        };
    }
}








export async function saveModlogSettings(client, guildId, settings) {
    const key = getModlogSettingsKey(guildId);
    try {
        const existingSettings = await getModlogSettings(client, guildId);
        const mergedSettings = { ...existingSettings, ...settings };
        
        await client.db.set(key, mergedSettings);
        return true;
    } catch (error) {
        console.error(`Error saving modlog settings for guild ${guildId}:`, error);
        return false;
    }
}







export async function createModlogEntry(client, entry) {
    const { guildId, userId } = entry;
    const caseId = generateCaseId();
    const key = getModlogEntryKey(guildId, caseId);
    
    const newEntry = {
        ...entry,
        caseId,
        createdAt: Date.now(),
        updatedAt: Date.now()
    };
    
    try {
        await client.db.set(key, newEntry);
        
        const userKey = getUserModlogKey(guildId, userId);
        const userEntries = await client.db.get(userKey, []);
        
        if (!userEntries.includes(caseId)) {
            userEntries.push(caseId);
            await client.db.set(userKey, userEntries);
        }
        
        return newEntry;
    } catch (error) {
        console.error(`Error creating modlog entry for user ${userId} in guild ${guildId}:`, error);
        throw error;
    }
}








export async function getModlogEntry(client, guildId, caseId) {
    const key = getModlogEntryKey(guildId, caseId);
    try {
        const entry = await client.db.get(key, null);
        return unwrapReplitData(entry);
    } catch (error) {
        console.error(`Error getting modlog entry ${caseId} in guild ${guildId}:`, error);
        return null;
    }
}









export async function updateModlogEntry(client, guildId, caseId, updates) {
    const key = getModlogEntryKey(guildId, caseId);
    try {
        const existingEntry = await getModlogEntry(client, guildId, caseId);
        if (!existingEntry) {
            throw new Error(`Modlog entry ${caseId} not found`);
        }
        
        const updatedEntry = {
            ...existingEntry,
            ...updates,
            updatedAt: Date.now()
        };
        
        await client.db.set(key, updatedEntry);
        return updatedEntry;
    } catch (error) {
        console.error(`Error updating modlog entry ${caseId} in guild ${guildId}:`, error);
        throw error;
    }
}








export async function getUserModlogEntries(client, guildId, userId) {
    const userKey = getUserModlogKey(guildId, userId);
    try {
        const caseIds = await client.db.get(userKey, []);
        const entryPromises = caseIds.map(caseId => 
            getModlogEntry(client, guildId, caseId)
        );
        
        const entries = await Promise.all(entryPromises);
        return entries.filter(Boolean);
    } catch (error) {
        console.error(`Error getting modlog entries for user ${userId} in guild ${guildId}:`, error);
        return [];
    }
}













export async function getModlogEntries(client, guildId, filters = {}) {
    const {
        userId,
        moderatorId,
        action,
        limit = 50,
        offset = 0
    } = filters;
    
    try {
        const prefix = `guild:${guildId}:modlog:cases:`;
        const keys = await client.db.list(prefix);
        
        const entryPromises = keys.map(key => client.db.get(key));
        let entries = (await Promise.all(entryPromises))
            .map(unwrapReplitData)
            .filter(Boolean);
        
        if (userId) {
            entries = entries.filter(entry => entry.userId === userId);
        }
        
        if (moderatorId) {
            entries = entries.filter(entry => entry.moderatorId === moderatorId);
        }
        
        if (action) {
            entries = entries.filter(entry => entry.action === action);
        }
        
        entries.sort((a, b) => b.createdAt - a.createdAt);
        
        return entries.slice(offset, offset + limit);
    } catch (error) {
        console.error(`Error getting modlog entries for guild ${guildId}:`, error);
        return [];
    }
}







export function getJoinToCreateConfigKey(guildId) {
    return `guild:${guildId}:jointocreate`;
}






export function getJoinToCreateChannelsKey(guildId) {
    return `guild:${guildId}:jointocreate:channels`;
}







export async function getJoinToCreateConfig(client, guildId) {
    if (!client.db) {
        console.warn('Database not available for getJoinToCreateConfig');
        return {
            enabled: false,
            triggerChannels: [],
            categoryId: null,
            channelNameTemplate: "{username}'s Room",
            userLimit: 0,
            bitrate: 64000,
            temporaryChannels: {}
        };
    }
    
    const key = getJoinToCreateConfigKey(guildId);
    try {
        const config = await client.db.get(key, {});
        const unwrapped = unwrapReplitData(config);
        
        return {
            enabled: unwrapped.enabled || false,
            triggerChannels: unwrapped.triggerChannels || [],
            categoryId: unwrapped.categoryId || null,
            channelNameTemplate: unwrapped.channelNameTemplate || "{username}'s Room",
            userLimit: unwrapped.userLimit || 0,
            bitrate: unwrapped.bitrate || 64000,
            temporaryChannels: unwrapped.temporaryChannels || {},
            ...unwrapped
        };
    } catch (error) {
        console.error(`Error getting Join to Create config for guild ${guildId}:`, error);
        return {
            enabled: false,
            triggerChannels: [],
            categoryId: null,
            channelNameTemplate: "{username}'s Room",
            userLimit: 0,
            bitrate: 64000,
            temporaryChannels: {}
        };
    }
}








export async function saveJoinToCreateConfig(client, guildId, config) {
    const key = getJoinToCreateConfigKey(guildId);
    try {
        const existingConfig = await getJoinToCreateConfig(client, guildId);
        const mergedConfig = { ...existingConfig, ...config };
        
        await client.db.set(key, mergedConfig);
        return true;
    } catch (error) {
        console.error(`Error saving Join to Create config for guild ${guildId}:`, error);
        return false;
    }
}








export async function updateJoinToCreateConfig(client, guildId, updates) {
    try {
        const currentConfig = await getJoinToCreateConfig(client, guildId);
        const updatedConfig = { ...currentConfig, ...updates };
        
        await saveJoinToCreateConfig(client, guildId, updatedConfig);
        return updatedConfig;
    } catch (error) {
        console.error(`Error updating Join to Create config for guild ${guildId}:`, error);
        throw error;
    }
}









export async function addJoinToCreateTrigger(client, guildId, channelId, options = {}) {
    try {
        const config = await getJoinToCreateConfig(client, guildId);
        
        if (config.triggerChannels.includes(channelId)) {
            return false;
        }
        
        config.triggerChannels.push(channelId);
        config.enabled = config.triggerChannels.length > 0;
        
        if (Object.keys(options).length > 0) {
            if (!config.channelOptions) {
                config.channelOptions = {};
            }
            config.channelOptions[channelId] = {
                nameTemplate: options.nameTemplate || config.channelNameTemplate,
                userLimit: options.userLimit || config.userLimit,
                bitrate: options.bitrate || config.bitrate
            };
        }
        
        return await saveJoinToCreateConfig(client, guildId, config);
    } catch (error) {
        console.error(`Error adding Join to Create trigger for guild ${guildId}:`, error);
        return false;
    }
}








export async function removeJoinToCreateTrigger(client, guildId, channelId) {
    try {
        const config = await getJoinToCreateConfig(client, guildId);
        
        const index = config.triggerChannels.indexOf(channelId);
        if (index === -1) {
            return false;
        }
        
        config.triggerChannels.splice(index, 1);
        config.enabled = config.triggerChannels.length > 0;
        
        if (config.channelOptions && config.channelOptions[channelId]) {
            delete config.channelOptions[channelId];
        }
        
        return await saveJoinToCreateConfig(client, guildId, config);
    } catch (error) {
        console.error(`Error removing Join to Create trigger for guild ${guildId}:`, error);
        return false;
    }
}










export async function registerTemporaryChannel(client, guildId, channelId, ownerId, triggerChannelId) {
    try {
        const config = await getJoinToCreateConfig(client, guildId);
        
        config.temporaryChannels[channelId] = {
            ownerId,
            triggerChannelId,
            createdAt: Date.now()
        };
        
        return await saveJoinToCreateConfig(client, guildId, config);
    } catch (error) {
        console.error(`Error registering temporary channel for guild ${guildId}:`, error);
        return false;
    }
}








export async function unregisterTemporaryChannel(client, guildId, channelId) {
    try {
        const config = await getJoinToCreateConfig(client, guildId);
        
        if (config.temporaryChannels[channelId]) {
            delete config.temporaryChannels[channelId];
            return await saveJoinToCreateConfig(client, guildId, config);
        }
        
        return false;
    } catch (error) {
        console.error(`Error unregistering temporary channel for guild ${guildId}:`, error);
        return false;
    }
}








export async function getTemporaryChannelInfo(client, guildId, channelId) {
    try {
        const config = await getJoinToCreateConfig(client, guildId);
        return config.temporaryChannels[channelId] || null;
    } catch (error) {
        console.error(`Error getting temporary channel info for guild ${guildId}:`, error);
        return null;
    }
}







export function formatChannelName(template, variables) {
    let formatted = template;
    
    const replacements = {
        '{username}': variables.username || 'User',
        '{user_tag}': variables.userTag || 'User#0000',
        '{display_name}': variables.displayName || 'User',
        '{guild_name}': variables.guildName || 'Server',
        '{channel_name}': variables.channelName || 'Voice Channel'
    };
    
    for (const [placeholder, value] of Object.entries(replacements)) {
        formatted = formatted.replace(new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g'), value);
    }
    
    formatted = formatted.replace(/[^\w\s-]/g, '').trim();
formatted = formatted.substring(0, 100);
    
    return formatted || 'Voice Channel';
}





function generateCaseId() {
    return `${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 4)}`;
}



