import { redisDb } from './redisDatabase.js';
import { MemoryStorage } from './memoryStorage.js';
import { logger } from './logger.js';
import { BotConfig } from '../config/bot.js';

// Initialize database connection
let db = null;
let useFallback = false;

// Check if we're in a Replit environment (for backward compatibility)
const isReplitEnvironment = process.env.REPL_ID || process.env.REPL_OWNER || process.env.REPL_SLUG;

// Initialize Redis or fallback database
async function initializeDatabaseConnection() {
    try {
        // Try to connect to Redis first
        const redisConnected = await redisDb.connect();
        if (redisConnected) {
            db = redisDb;
            logger.info('✅ Redis Database initialized');
            return;
        }
    } catch (error) {
        logger.warn('Redis connection failed, using fallback:', error.message);
    }
    
    // Fallback to memory storage
    db = new MemoryStorage();
    useFallback = true;
    logger.info('🔄 Using in-memory storage as fallback');
}

/**
 * Wrapper class for Database with Redis support and fallback
 */
class DatabaseWrapper {
    constructor() {
        this.initialized = false;
    }

    async initialize() {
        if (!this.initialized) {
            await initializeDatabaseConnection();
            this.initialized = true;
        }
        return db;
    }

    async set(key, value, ttl = null) {
        await this.initialize();
        return db.set(key, value, ttl);
    }

    async get(key, defaultValue = null) {
        await this.initialize();
        return db.get(key, defaultValue);
    }

    async delete(key) {
        await this.initialize();
        return db.delete(key);
    }

    async list(prefix) {
        await this.initialize();
        return db.list(prefix);
    }

    async exists(key) {
        await this.initialize();
        if (db.exists) {
            return db.exists(key);
        }
        // Fallback for memory storage
        const value = await db.get(key);
        return value !== null;
    }

    async increment(key, amount = 1) {
        await this.initialize();
        if (db.increment) {
            return db.increment(key, amount);
        }
        // Fallback for memory storage
        const current = await db.get(key, 0);
        const newValue = current + amount;
        await db.set(key, newValue);
        return newValue;
    }

    async decrement(key, amount = 1) {
        await this.initialize();
        if (db.decrement) {
            return db.decrement(key, amount);
        }
        // Fallback for memory storage
        const current = await db.get(key, 0);
        const newValue = current - amount;
        await db.set(key, newValue);
        return newValue;
    }

    isAvailable() {
        return db && !useFallback;
    }

    getConnectionType() {
        if (useFallback) {
            return 'memory';
        }
        return 'redis';
    }
}

/**
 * Initialize the database connection
 * @returns {Promise<Object>} Database instance and helper functions
 */
export async function initializeDatabase() {
    try {
        logger.log("Initializing Database (Redis with fallback)...");
        const dbWrapper = new DatabaseWrapper();
        await dbWrapper.initialize();
        logger.log("✅ Database initialized (Redis or memory fallback)");
        return { db: dbWrapper };
    } catch (error) {
        logger.error("❌ Database Initialization Error:", error);
        return { db: null };
    }
}

// Get a value from the database with a default value if not found
export async function getFromDb(key, defaultValue = null) {
    try {
        const dbInstance = new DatabaseWrapper();
        const value = await dbInstance.get(key);
        return value === null ? defaultValue : value;
    } catch (error) {
        logger.error(`Error getting value for key ${key}:`, error);
        return defaultValue;
    }
}

// Set a value in the database
export async function setInDb(key, value, ttl = null) {
    try {
        const dbInstance = new DatabaseWrapper();
        await dbInstance.set(key, value, ttl);
        return true;
    } catch (error) {
        logger.error(`Error setting value for key ${key}:`, error);
        return false;
    }
}

// Delete a key from the database
export async function deleteFromDb(key) {
    try {
        const dbInstance = new DatabaseWrapper();
        await dbInstance.delete(key);
        return true;
    } catch (error) {
        logger.error(`Error deleting key ${key}:`, error);
        return false;
    }
}

/**
 * Extract actual data from database response (for backward compatibility)
 * @param {any} data - Data to unwrap
 * @returns {any} Unwrapped data
 */
export function unwrapReplitData(data) {
    // For backward compatibility with Replit database structure
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

// Guild configuration keys
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

        const finalConfig =
            typeof cleanedConfig === "object" && cleanedConfig !== null
                ? cleanedConfig
                : {};

        // Initialize default values
        finalConfig.logIgnore = finalConfig.logIgnore || {
            users: [],
            channels: [],
        };
        finalConfig.enabledCommands = finalConfig.enabledCommands || {};
        finalConfig.reportChannelId = finalConfig.reportChannelId || null;
        finalConfig.birthdayChannelId = finalConfig.birthdayChannelId || null;
        finalConfig.premiumRoleId = finalConfig.premiumRoleId || null;

        return finalConfig;
    } catch (error) {
        console.error(`Error fetching config for guild ${guildId}:`, error);
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
            console.error("Database client is not available for setGuildConfig.");
            return false;
        }

        const key = getGuildConfigKey(guildId);
        await client.db.set(key, config);
        return true;
    } catch (error) {
        console.error(`Error saving config for guild ${guildId}:`, error);
        return false;
    }
}

// Export database wrapper and utilities
export { DatabaseWrapper, redisDb };

// Export message helper
export const getMessage = (key, replacements = {}) => {
    let message = BotConfig.messages[key] || key;
    for (const [k, v] of Object.entries(replacements)) {
        message = message.replace(new RegExp(`\\{${k}\\}`, "g"), v);
    }
    return message;
};

// Export color helper
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
        // Check if database is available
        if (!client.db || typeof client.db.get !== "function") {
            console.error("Database client is not available for getGuildBirthdays.");
            return {};
        }

        const rawData = await client.db.get(key, {});
        // Birthdays are stored as a map: { 'userId': { month: number, day: number }, ... }
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
        // Check if database is available
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
        // Check if database is available
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

/**
 * Get the month name from a month number (1-12)
 * @param {number} monthNum - Month number (1-12)
 * @returns {string} Month name
 */
export function getMonthName(monthNum) {
    const months = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ];
    return months[Math.max(0, Math.min(monthNum - 1, 11))] || 'Unknown';
}

// 🎁 GIVEAWAY FUNCTIONS

/**
 * Get all giveaways for a guild
 * @param {Object} client - Discord client with database
 * @param {string} guildId - Guild ID
 * @returns {Promise<Object>} Object mapping message IDs to giveaway data
 */
export async function getGuildGiveaways(client, guildId) {
    const key = giveawayKey(guildId);
    try {
        // Check if database is available
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
        // Check if database is available
        if (!client.db || typeof client.db.set !== "function") {
            console.error("Database client is not available for saveGiveaway.");
            return false;
        }

        const key = giveawayKey(guildId);
        const giveaways = await getGuildGiveaways(client, guildId);
        const existingIndex = giveaways.findIndex(g => g.messageId === giveawayData.messageId);
        
        if (existingIndex >= 0) {
            giveaways[existingIndex] = giveawayData;
        } else {
            giveaways.push(giveawayData);
        }
        
        await client.db.set(key, giveaways);
        return giveawayData;
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
 * Generate a consistent key for giveaways in the database
 * @param {string} guildId - The guild ID
 * @returns {string} The formatted key
 */
export function giveawayKey(guildId) {
    return `guild:${guildId}:giveaways`;
}

/**
 * Get AFK status for a user in a guild
 * @param {Object} client - Discord client with database
 * @param {string} guildId - Guild ID
 * @param {string} userId - User ID
 * @returns {Promise<Object|null>} AFK data or null if not found
 */
export async function getAFKStatus(client, guildId, userId) {
    const key = getAFKKey(guildId, userId);
    try {
        return await client.db.get(key, null);
    } catch (error) {
        console.error(`Error getting AFK status for user ${userId} in guild ${guildId}:`, error);
        return null;
    }
}

/**
 * Generate a key for AFK data
 * @param {string} guildId - Guild ID
 * @param {string} userId - User ID
 * @returns {string} The formatted key
 */
export function getAFKKey(guildId, userId) {
    return `${guildId}:user:${userId}:afk`;
}

// ====================
// WELCOME SYSTEM UTILS
// ====================

/**
 * Get the welcome system configuration key for a guild
 * @param {string} guildId - The guild ID
 * @returns {string} The welcome config key
 */
export function getWelcomeConfigKey(guildId) {
    return `guild:${guildId}:welcome`;
}

/**
 * Get welcome system configuration for a guild
 * @param {Object} client - The Discord client
 * @param {string} guildId - The ID of the guild
 * @returns {Promise<Object>} The welcome system configuration
 */
export async function getWelcomeConfig(client, guildId) {
    const key = getWelcomeConfigKey(guildId);
    try {
        const config = await client.db.get(key, {});
        const unwrapped = unwrapReplitData(config);
        
        // Ensure all required fields exist with defaults
        return {
            enabled: unwrapped.enabled || false,
            channelId: unwrapped.channelId || null,
            welcomeMessage: unwrapped.welcomeMessage || "Welcome {user.mention} to {server.name}!",
            welcomeEmbed: unwrapped.welcomeEmbed || {
                title: "Welcome to {server.name}!",
                description: "We're glad to have you here, {user.mention}!",
                color: getColor('primary'),
                thumbnail: true,
                footer: `You are member #{memberCount}`
            },
            goodbyeEnabled: unwrapped.goodbyeEnabled || false,
            goodbyeChannelId: unwrapped.goodbyeChannelId || null,
            leaveMessage: unwrapped.leaveMessage || "{user.tag} has left the server.",
            leaveEmbed: unwrapped.leaveEmbed || {
                title: "Goodbye {user.tag}",
                description: "We're sorry to see you go!",
                color: getColor('error'),
                thumbnail: true,
                footer: "We now have {memberCount} members"
            },
            dmMessage: unwrapped.dmMessage || "",
            roleIds: unwrapped.roleIds || [],
            autoRoleDelay: unwrapped.autoRoleDelay || 0,
            joinLogs: unwrapped.joinLogs || {
                enabled: false,
                channelId: null
            },
            leaveLogs: unwrapped.leaveLogs || {
                enabled: false,
                channelId: null
            },
            ...unwrapped
        };
    } catch (error) {
        console.error(`Error getting welcome config for guild ${guildId}:`, error);
        return {
            enabled: false,
            channelId: null,
            welcomeMessage: "Welcome {user.mention} to {server.name}!",
            welcomeEmbed: {
                title: "Welcome to {server.name}!",
                description: "We're glad to have you here, {user.mention}!",
                color: getColor('primary'),
                thumbnail: true,
                footer: `You are member #{memberCount}`
            },
            goodbyeEnabled: false,
            goodbyeChannelId: null,
            leaveMessage: "{user.tag} has left the server.",
            leaveEmbed: {
                title: "Goodbye {user.tag}",
                description: "We're sorry to see you go!",
                color: getColor('error'),
                thumbnail: true,
                footer: "We now have {memberCount} members"
            },
            dmMessage: "",
            roleIds: [],
            autoRoleDelay: 0,
            joinLogs: { enabled: false, channelId: null },
            leaveLogs: { enabled: false, channelId: null }
        };
    }
}

/**
 * Save welcome system configuration for a guild
 * @param {Object} client - The Discord client
 * @param {string} guildId - The ID of the guild
 * @param {Object} config - The configuration to save
 * @returns {Promise<boolean>} Whether the operation was successful
 */
export async function saveWelcomeConfig(client, guildId, config) {
    const key = getWelcomeConfigKey(guildId);
    try {
        // Get existing config to merge with new values
        const existingConfig = await getWelcomeConfig(client, guildId);
        const mergedConfig = { ...existingConfig, ...config };
        
        // Save the merged config
        await client.db.set(key, mergedConfig);
        return true;
    } catch (error) {
        console.error(`Error saving welcome config for guild ${guildId}:`, error);
        return false;
    }
}

/**
 * Update specific fields in the welcome config
 * @param {Object} client - The Discord client
 * @param {string} guildId - The ID of the guild
 * @param {Object} updates - The fields to update
 * @returns {Promise<Object>} The updated config
 */
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

// ====================
// LEVELING SYSTEM UTILS
// ====================

/**
 * Gets the leveling data key for a guild
 * @param {string} guildId - The ID of the guild
 * @returns {string} The leveling data key
 */
export function getLevelingKey(guildId) {
    return `guild:${guildId}:leveling:config`;
}

/**
 * Gets the user level data key
 * @param {string} guildId - The ID of the guild
 * @param {string} userId - The ID of the user
 * @returns {string} The user level data key
 */
export function getUserLevelKey(guildId, userId) {
    return `guild:${guildId}:leveling:users:${userId}`;
}

/**
 * Gets the leveling configuration for a guild
 * @param {Object} client - The Discord client
 * @param {string} guildId - The ID of the guild
 * @returns {Promise<Object>} The leveling configuration
 */
export async function getLevelingConfig(client, guildId) {
    const key = getLevelingKey(guildId);
    try {
        // Check if database is available (including memory fallback)
        if (!client.db || typeof client.db.get !== "function") {
            console.error("Database client is not available for getLevelingConfig.");
            // Return default config
            return {
                enabled: false,
                xpPerMessage: { min: 15, max: 25 },
                levelUpMessage: "{user.mention} has leveled up to level **{level}**! 🎉",
                levelUpChannelId: null,
                ignoredChannels: [],
                ignoredRoles: [],
                roleRewards: {},
                xpCooldown: 60,
                maxLevel: 100,
                xpMultiplier: 1.0,
                xpMultipliers: {},
                announceLevelUp: true,
                stackRoleRewards: false,
                blacklistedUsers: []
            };
        }

        const config = await client.db.get(key, {});
        const unwrapped = unwrapReplitData(config);
        
        // Default configuration
        const defaultConfig = {
            enabled: false,
            xpPerMessage: {
                min: 15,
                max: 25
            },
            levelUpMessage: "{user.mention} has leveled up to level **{level}**! 🎉",
            levelUpChannelId: null,
            ignoredChannels: [],
            ignoredRoles: [],
            roleRewards: {},
            xpCooldown: 60, // seconds
            maxLevel: 100,
            xpMultiplier: 1.0,
            xpMultipliers: {},
            announceLevelUp: true,
            stackRoleRewards: false,
            blacklistedUsers: []
        };
        
        const finalConfig = { ...defaultConfig, ...unwrapped };
        
        // Log if using memory storage
        if (client.db.isAvailable && !client.db.isAvailable()) {
            console.log(`📝 Using in-memory storage for leveling config (guild: ${guildId})`);
        }
        
        return finalConfig;
    } catch (error) {
        console.error(`Error getting leveling config for guild ${guildId}:`, error);
        return {
            enabled: false,
            xpPerMessage: { min: 15, max: 25 },
            levelUpMessage: "{user.mention} has leveled up to level **{level}**! 🎉",
            levelUpChannelId: null,
            ignoredChannels: [],
            ignoredRoles: [],
            roleRewards: {},
            xpCooldown: 60,
            maxLevel: 100,
            xpMultiplier: 1.0,
            xpMultipliers: {},
            announceLevelUp: true,
            stackRoleRewards: false,
            blacklistedUsers: []
        };
    }
}

/**
 * Saves the leveling configuration for a guild
 * @param {Object} client - The Discord client
 * @param {string} guildId - The ID of the guild
 * @param {Object} config - The configuration to save
 * @returns {Promise<boolean>} Whether the operation was successful
 */
export async function saveLevelingConfig(client, guildId, config) {
    const key = getLevelingKey(guildId);
    try {
        // Check if database is available (including memory fallback)
        if (!client.db || typeof client.db.set !== "function") {
            console.error("Database client is not available for saveLevelingConfig.");
            return false;
        }

        await client.db.set(key, config);
        
        // Log if using memory storage
        if (client.db.isAvailable && !client.db.isAvailable()) {
            console.log(`💾 Saved leveling config to in-memory storage (guild: ${guildId})`);
            console.log(`🔧 Leveling system is now ${config.enabled ? 'ENABLED' : 'DISABLED'} (in-memory only)`);
        } else {
            console.log(`💾 Saved leveling config to database (guild: ${guildId})`);
        }
        
        return true;
    } catch (error) {
        console.error(`Error saving leveling config for guild ${guildId}:`, error);
        return false;
    }
}

/**
 * Gets a user's level data
 * @param {Object} client - The Discord client
 * @param {string} guildId - The ID of the guild
 * @param {string} userId - The ID of the user
 * @returns {Promise<Object>} The user's level data
 */
export async function getUserLevelData(client, guildId, userId) {
    const key = getUserLevelKey(guildId, userId);
    try {
        // Check if database is available (including memory fallback)
        if (!client.db || typeof client.db.get !== "function") {
            // Return default user data without error logging for memory storage
            return {
                xp: 0,
                level: 0,
                totalXp: 0,
                lastMessage: 0,
                rank: 0,
                xpToNextLevel: getXpForLevel(1)
            };
        }

        const data = await client.db.get(key, null);
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
        
        const unwrapped = unwrapReplitData(data);
        const levelData = {
            xp: unwrapped.xp || 0,
            level: unwrapped.level || 0,
            totalXp: unwrapped.totalXp || 0,
            lastMessage: unwrapped.lastMessage || 0,
            rank: unwrapped.rank || 0,
            xpToNextLevel: getXpForLevel((unwrapped.level || 0) + 1)
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

/**
 * Saves a user's level data
 * @param {Object} client - The Discord client
 * @param {string} guildId - The ID of the guild
 * @param {string} userId - The ID of the user
 * @param {Object} data - The level data to save
 * @returns {Promise<boolean>} Whether the operation was successful
 */
export async function saveUserLevelData(client, guildId, userId, data) {
    const key = getUserLevelKey(guildId, userId);
    try {
        // Check if database is available
        if (!client.db || typeof client.db.set !== "function") {
            console.error("Database client is not available for saveUserLevelData.");
            return false;
        }

        // Calculate additional fields
        const levelData = {
            ...data,
            // Make sure required fields exist
            xp: data.xp || 0,
            level: data.level || 0,
            totalXp: data.totalXp || 0,
            lastMessage: data.lastMessage || 0,
            rank: data.rank || 0,
            updatedAt: Date.now()
        };
        
        await client.db.set(key, levelData);
        return true;
    } catch (error) {
        console.error(`Error saving level data for user ${userId} in guild ${guildId}:`, error);
        return false;
    }
}

/**
 * Calculates the XP needed for a specific level
 * @param {number} level - The level to calculate XP for
 * @returns {number} The XP needed for the level
 */
export function getXpForLevel(level) {
    // 5 * (level ^ 2) + (50 * level) + 100 - 50
    return 5 * Math.pow(level, 2) + 50 * level + 50;
}

/**
 * Gets the leaderboard for a guild
 * @param {Object} client - The Discord client
 * @param {string} guildId - The ID of the guild
 * @param {number} limit - The maximum number of entries to return (default: 10)
 * @returns {Promise<Array>} Sorted array of user level data
 */
export async function getLeaderboard(client, guildId, limit = 10) {
    try {
        // Check if database is available
        if (!client.db || typeof client.db.list !== "function") {
            console.error("Database client is not available for getLeaderboard.");
            return [];
        }

        const prefix = `guild:${guildId}:leveling:users:`;
        let keys = await client.db.list(prefix);
        
        // Ensure keys is an array
        if (!Array.isArray(keys)) {
            // Try to handle if it's an object with values
            if (typeof keys === 'object' && keys !== null) {
                keys = Object.keys(keys).filter(key => key.startsWith(prefix));
            } else {
                return [];
            }
        }
        
        if (keys.length === 0) {
            return [];
        }
        
        // Get all user data in parallel
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
                    rank: 0 // Will be set after sorting
                };
            } catch (error) {
                console.error(`Error processing leaderboard key ${key}:`, error);
                return null;
            }
        });
        
        let userData = (await Promise.all(userDataPromises)).filter(Boolean);
        
        // Sort by total XP (descending)
        userData.sort((a, b) => (b.totalXp || 0) - (a.totalXp || 0));
        
        // Set ranks
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

// ====================
// APPLICATION SYSTEM UTILS
// ====================

/**
 * Get the application roles key for a guild
 * @param {string} guildId - The guild ID
 * @returns {string} The application roles key
 */
export function getApplicationRolesKey(guildId) {
    return `guild:${guildId}:applications:roles`;
}

/**
 * Get application roles for a guild
 * @param {Object} client - The Discord client
 * @param {string} guildId - The guild ID
 * @returns {Promise<Array>} Array of application roles
 */
export async function getApplicationRoles(client, guildId) {
    try {
        // Check if database is available
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

/**
 * Save application roles for a guild
 * @param {Object} client - The Discord client
 * @param {string} guildId - The guild ID
 * @param {Array} roles - Array of application roles
 * @returns {Promise<boolean>} Whether the operation was successful
 */
export async function saveApplicationRoles(client, guildId, roles) {
    try {
        // Check if database is available
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

/**
 * Get the application settings key for a guild
 * @param {string} guildId - The guild ID
 * @returns {string} The application settings key
 */
export function getApplicationSettingsKey(guildId) {
    return `guild:${guildId}:applications:settings`;
}

/**
 * Get the user applications key
 * @param {string} guildId - The guild ID
 * @param {string} userId - The user ID
 * @returns {string} The user applications key
 */
export function getUserApplicationsKey(guildId, userId) {
    return `guild:${guildId}:applications:users:${userId}`;
}

/**
 * Get the application key
 * @param {string} guildId - The guild ID
 * @param {string} applicationId - The application ID
 * @returns {string} The application key
 */
export function getApplicationKey(guildId, applicationId) {
    return `guild:${guildId}:applications:${applicationId}`;
}

/**
 * Get application settings for a guild
 * @param {Object} client - The Discord client
 * @param {string} guildId - The guild ID
 * @returns {Promise<Object>} The application settings
 */
export async function getApplicationSettings(client, guildId) {
    const key = getApplicationSettingsKey(guildId);
    try {
        const settings = await client.db.get(key, {});
        const unwrapped = unwrapReplitData(settings);
        
        // Default settings
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
            minAccountAge: 0, // days
            maxApplications: 1,
            cooldown: 7, // days
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

/**
 * Save application settings for a guild
 * @param {Object} client - The Discord client
 * @param {string} guildId - The guild ID
 * @param {Object} settings - The settings to save
 * @returns {Promise<boolean>} Whether the operation was successful
 */
export async function saveApplicationSettings(client, guildId, settings) {
    const key = getApplicationSettingsKey(guildId);
    try {
        // Get existing settings to merge with new values
        const existingSettings = await getApplicationSettings(client, guildId);
        const mergedSettings = { ...existingSettings, ...settings };
        
        await client.db.set(key, mergedSettings);
        return true;
    } catch (error) {
        console.error(`Error saving application settings for guild ${guildId}:`, error);
        return false;
    }
}

/**
 * Create a new application
 * @param {Object} client - The Discord client
 * @param {Object} application - The application data
 * @returns {Promise<Object>} The created application
 */
export async function createApplication(client, application) {
    const { guildId, userId } = application;
    const applicationId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const key = getApplicationKey(guildId, applicationId);
    
    const newApplication = {
        ...application,
        id: applicationId,
        status: 'pending', // pending, reviewing, accepted, denied
        createdAt: Date.now(),
        updatedAt: Date.now(),
        reviewedBy: null,
        reviewedAt: null,
        notes: []
    };
    
    try {
        // Check if database is available
        if (!client.db || typeof client.db.set !== "function") {
            console.error("Database client is not available for createApplication.");
            throw new Error("Database not available");
        }

        // Save the application
        await client.db.set(key, newApplication);
        
        // Add to user's applications
        const userKey = getUserApplicationsKey(guildId, userId);
        const userApplications = await client.db.get(userKey, []);
        const unwrappedApplications = unwrapReplitData(userApplications);
        
        // Ensure we have an array
        const applicationsArray = Array.isArray(unwrappedApplications) ? unwrappedApplications : [];
        applicationsArray.push(applicationId);
        
        await client.db.set(userKey, applicationsArray);
        console.log(`Successfully created application ${applicationId} for user ${userId}`);
        
        return newApplication;
    } catch (error) {
        console.error(`Error creating application for user ${userId} in guild ${guildId}:`, error);
        throw error;
    }
}

/**
 * Get an application by ID
 * @param {Object} client - The Discord client
 * @param {string} guildId - The guild ID
 * @param {string} applicationId - The application ID
 * @returns {Promise<Object|null>} The application or null if not found
 */
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

/**
 * Update an application
 * @param {Object} client - The Discord client
 * @param {string} guildId - The guild ID
 * @param {string} applicationId - The application ID
 * @param {Object} updates - The updates to apply
 * @returns {Promise<Object>} The updated application
 */
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

/**
 * Get all applications for a user in a guild
 * @param {Object} client - The Discord client
 * @param {string} guildId - The guild ID
 * @param {string} userId - The user ID
 * @returns {Promise<Array>} The user's applications
 */
export async function getUserApplications(client, guildId, userId) {
    const userKey = getUserApplicationsKey(guildId, userId);
    try {
        // Check if database is available
        if (!client.db || typeof client.db.get !== "function") {
            console.error("Database client is not available for getUserApplications.");
            return [];
        }

        const applicationIds = await client.db.get(userKey, []);
        const unwrappedIds = unwrapReplitData(applicationIds);
        
        // Ensure we have an array
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

/**
 * Get all applications in a guild with optional filters
 * @param {Object} client - The Discord client
 * @param {string} guildId - The guild ID
 * @param {Object} [filters] - Optional filters
 * @param {string} [filters.status] - Filter by status
 * @param {string} [filters.userId] - Filter by user ID
 * @param {number} [filters.limit=50] - Maximum number of applications to return
 * @param {number} [filters.offset=0] - Number of applications to skip
 * @returns {Promise<Array>} The filtered applications
 */
export async function getApplications(client, guildId, filters = {}) {
    const {
        status,
        userId,
        limit = 50,
        offset = 0
    } = filters;
    
    try {
        // Check if database is available
        if (!client.db || typeof client.db.list !== "function") {
            console.error("Database client is not available for getApplications.");
            return [];
        }

        const prefix = `guild:${guildId}:applications:`;
        let keys = await client.db.list(prefix);
        
        // Ensure keys is an array
        if (!Array.isArray(keys)) {
            // Try to handle if it's an object with values
            if (typeof keys === 'object' && keys !== null) {
                const keyArray = Object.keys(keys).filter(key => key.startsWith(prefix));
                keys = keyArray;
            } else {
                return [];
            }
        }
        
        // Filter out the settings key
        const applicationKeys = keys.filter(key => !key.endsWith('settings') && key.includes('applications:'));
        
        // Get all applications in parallel
        const applicationPromises = applicationKeys.map(key => client.db.get(key));
        let applications = (await Promise.all(applicationPromises))
            .map(unwrapReplitData)
            .filter(Boolean);
        
        // Apply filters
        if (status) {
            applications = applications.filter(app => app.status === status);
        }
        
        if (userId) {
            applications = applications.filter(app => app.userId === userId);
        }
        
        // Sort by creation date (newest first)
        applications.sort((a, b) => b.createdAt - a.createdAt);
        
        // Apply pagination
        return applications.slice(offset, offset + limit);
    } catch (error) {
        console.error(`Error getting applications for guild ${guildId}:`, error);
        return [];
    }
}

// ====================
// MODERATION LOGS UTILS
// ====================

/**
 * Get the modlog settings key for a guild
 * @param {string} guildId - The guild ID
 * @returns {string} The modlog settings key
 */
export function getModlogSettingsKey(guildId) {
    return `guild:${guildId}:modlog:settings`;
}

/**
 * Get the modlog entry key
 * @param {string} guildId - The guild ID
 * @param {string} caseId - The case ID
 * @returns {string} The modlog entry key
 */
export function getModlogEntryKey(guildId, caseId) {
    return `guild:${guildId}:modlog:cases:${caseId}`;
}

/**
 * Get the modlog user cases key
 * @param {string} guildId - The guild ID
 * @param {string} userId - The user ID
 * @returns {string} The user's modlog cases key
 */
export function getUserModlogKey(guildId, userId) {
    return `guild:${guildId}:modlog:users:${userId}`;
}

/**
 * Get modlog settings for a guild
 * @param {Object} client - The Discord client
 * @param {string} guildId - The guild ID
 * @returns {Promise<Object>} The modlog settings
 */
export async function getModlogSettings(client, guildId) {
    const key = getModlogSettingsKey(guildId);
    try {
        const settings = await client.db.get(key, {});
        const unwrapped = unwrapReplitData(settings);
        
        // Default settings
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

/**
 * Save modlog settings for a guild
 * @param {Object} client - The Discord client
 * @param {string} guildId - The guild ID
 * @param {Object} settings - The settings to save
 * @returns {Promise<boolean>} Whether the operation was successful
 */
export async function saveModlogSettings(client, guildId, settings) {
    const key = getModlogSettingsKey(guildId);
    try {
        // Get existing settings to merge with new values
        const existingSettings = await getModlogSettings(client, guildId);
        const mergedSettings = { ...existingSettings, ...settings };
        
        await client.db.set(key, mergedSettings);
        return true;
    } catch (error) {
        console.error(`Error saving modlog settings for guild ${guildId}:`, error);
        return false;
    }
}

/**
 * Create a new modlog entry
 * @param {Object} client - The Discord client
 * @param {Object} entry - The modlog entry data
 * @returns {Promise<Object>} The created modlog entry
 */
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
        // Save the modlog entry
        await client.db.set(key, newEntry);
        
        // Add to user's modlog entries
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

/**
 * Get a modlog entry by case ID
 * @param {Object} client - The Discord client
 * @param {string} guildId - The guild ID
 * @param {string} caseId - The case ID
 * @returns {Promise<Object|null>} The modlog entry or null if not found
 */
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

/**
 * Update a modlog entry
 * @param {Object} client - The Discord client
 * @param {string} guildId - The guild ID
 * @param {string} caseId - The case ID
 * @param {Object} updates - The updates to apply
 * @returns {Promise<Object>} The updated modlog entry
 */
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

/**
 * Get all modlog entries for a user in a guild
 * @param {Object} client - The Discord client
 * @param {string} guildId - The guild ID
 * @param {string} userId - The user ID
 * @returns {Promise<Array>} The user's modlog entries
 */
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

/**
 * Get all modlog entries in a guild with optional filters
 * @param {Object} client - The Discord client
 * @param {string} guildId - The guild ID
 * @param {Object} [filters] - Optional filters
 * @param {string} [filters.userId] - Filter by user ID
 * @param {string} [filters.moderatorId] - Filter by moderator ID
 * @param {string} [filters.action] - Filter by action type
 * @param {number} [filters.limit=50] - Maximum number of entries to return
 * @param {number} [filters.offset=0] - Number of entries to skip
 * @returns {Promise<Array>} The filtered modlog entries
 */
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
        
        // Get all modlog entries in parallel
        const entryPromises = keys.map(key => client.db.get(key));
        let entries = (await Promise.all(entryPromises))
            .map(unwrapReplitData)
            .filter(Boolean);
        
        // Apply filters
        if (userId) {
            entries = entries.filter(entry => entry.userId === userId);
        }
        
        if (moderatorId) {
            entries = entries.filter(entry => entry.moderatorId === moderatorId);
        }
        
        if (action) {
            entries = entries.filter(entry => entry.action === action);
        }
        
        // Sort by creation date (newest first)
        entries.sort((a, b) => b.createdAt - a.createdAt);
        
        // Apply pagination
        return entries.slice(offset, offset + limit);
    } catch (error) {
        console.error(`Error getting modlog entries for guild ${guildId}:`, error);
        return [];
    }
}

/**
 * Generate a unique case ID
 * @returns {string} A unique case ID
 */
function generateCaseId() {
    return `${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 4)}`;
}
