import {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
    PermissionsBitField,
    Events
} from "discord.js";
import Database from "@replit/database";
import { BotConfig } from "./bot_config.js";

/**
 * Generates priority map from BotConfig for ticket priorities.
 * Maps priority level strings to their display names and colors.
 * Uses the centralized configuration from BotConfig.
 */
function getPriorityMap() {
    const priorities = BotConfig.tickets?.priorities || {};
    const map = {};

    for (const [key, config] of Object.entries(priorities)) {
        map[key] = {
            name: `${config.emoji} ${config.label.toUpperCase()}`,
            color: config.color,
            emoji: config.emoji,
            label: config.label,
        };
    }

    return map;
}

// Initialize priority map from configuration
const PRIORITY_MAP = getPriorityMap();

/**
 * Get a color from the configuration with a fallback
 * @param {string} path - Dot notation path to the color (e.g., 'primary', 'ticket.open')
 * @param {string} fallback - Fallback color if the path doesn't exist
 * @returns {string} The color code
 */
export function getColor(path, fallback = "#000000") {
    const parts = path.split(".");
    let current = BotConfig.embeds.colors;

    for (const part of parts) {
        if (current[part] === undefined) {
            console.warn(
                `Color path '${path}' not found in config, using fallback`,
            );
            return fallback;
        }
        current = current[part];
    }

    return typeof current === "string" ? current : fallback;
}

/**
 * Get a message from the configuration with optional replacements
 * @param {string} key - The message key (e.g., 'noPermission')
 * @param {Object} [replacements] - Key-value pairs for string replacements
 * @returns {string} The formatted message
 */
export function getMessage(key, replacements = {}) {
    let message = BotConfig.messages[key] || key;

    // Replace placeholders like {key} with their values
    for (const [k, v] of Object.entries(replacements)) {
        message = message.replace(new RegExp(`\\{${k}\\}`, "g"), v);
    }

    return message;
}

// --- REPLIT DB WRAPPER ---
class ReplitDb {
    constructor() {
        this.db = new Database();
    }
    async set(key, value) {
        return this.db.set(key, value);
    }
    async get(key, defaultValue = null) {
        const value = await this.db.get(key);
        return value === null ? defaultValue : value;
    }
    async delete(key) {
        return this.db.delete(key);
    }
    // New: Added list method for potentially listing keys
    async list(prefix) {
        return this.db.list(prefix);
    }
}

export function initializeDatabase() {
    try {
        console.log("Attempting to initialize Replit Database...");
        const db = new ReplitDb();
        console.log("✅ Replit Database initialized.");
        return { db };
    } catch (error) {
        console.error("Replit Database Initialization Error:", error);
        return { db: null };
    }
}

function unwrapReplitData(data) {
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

// --- NEW FUNCTION TO SAVE GUILD CONFIG ---
export async function setGuildConfig(client, guildId, newData) {
    const key = getGuildConfigKey(guildId);
    if (client.db && typeof client.db.set === "function") {
        await client.db.set(key, newData);
    } else {
        console.error("Database client is not available for setGuildConfig.");
    }
}
// ------------------------------------------

export const getGuildBirthdaysKey = (guildId) => `guild:${guildId}:birthdays`;

export function getEconomyKey(guildId, userId) {
    return `economy:${guildId}:${userId}`;
}

// 🔑 AFK KEY: Standardized key for AFK data
export function getAFKKey(guildId, userId) {
    return `${guildId}:user:${userId}:afk`;
}

// 🎁 Giveaways: Use a single consistent key function
export const giveawayKey = (guildId) => `guild:${guildId}:giveaways`;
export const getGiveawaysKey = giveawayKey;

// --- CONFIG HELPER (UPDATED for premiumRoleId) ---
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

        finalConfig.logIgnore = finalConfig.logIgnore || {
            users: [],
            channels: [],
        };
        finalConfig.enabledCommands = finalConfig.enabledCommands || {};
        // Ensure reportChannelId is initialized if missing
        finalConfig.reportChannelId = finalConfig.reportChannelId || null;

        // 🎂 Initialize birthday config
        finalConfig.birthdayChannelId = finalConfig.birthdayChannelId || null;

        // 👑 NEW: Initialize premiumRoleId
        finalConfig.premiumRoleId = finalConfig.premiumRoleId || null;

        return finalConfig;
    } catch (error) {
        console.error(`Error fetching config for guild ${guildId}:`, error);
        return {};
    }
}

export async function getGuildBirthdays(client, guildId) {
    const key = getGuildBirthdaysKey(guildId);
    try {
        const rawData = await client.db.get(key, {});
        // Birthdays are stored as a map: { 'userId': { month: number, day: number }, ... }
        return unwrapReplitData(rawData) || {};
    } catch (error) {
        console.error(
            `Error retrieving birthdays for guild ${guildId}:`,
            error,
        );
        return {};
    }
}

export async function setBirthday(client, guildId, userId, month, day) {
    const key = getGuildBirthdaysKey(guildId);
    // Fetch current birthdays
    const birthdays = await getGuildBirthdays(client, guildId);

    // Update the map for the specific user
    birthdays[userId] = { month, day };

    // Save the updated map back to the database
    await client.db.set(key, birthdays);
}

export async function deleteBirthday(client, guildId, userId) {
    const key = getGuildBirthdaysKey(guildId);
    const birthdays = await getGuildBirthdays(client, guildId);

    if (birthdays[userId]) {
        delete birthdays[userId];
        await client.db.set(key, birthdays);
        return true;
    }
    return false;
}

export function getMonthName(monthNum) {
    const months = [
        "Jan",
        "Feb",
        "Mar",
        "Apr",
        "May",
        "Jun",
        "Jul",
        "Aug",
        "Sep",
        "Oct",
        "Nov",
        "Dec",
    ];
    // Month numbers are 1-based, array indices are 0-based
    return months[monthNum - 1] || "Invalid Month";
}

// The core giveaway functions now correctly use the new giveawayKey() structure
export async function getGuildGiveaways(client, guildId) {
    try {
        const key = giveawayKey(guildId);
        const result = await client.db.get(key);
        // Handle both direct object and { ok: true, value: ... } format
        if (result && typeof result === "object" && "value" in result) {
            return result.value || {};
        }
        return result || {};
    } catch (error) {
        console.error("Error getting guild giveaways:", error);
        return {};
    }
}

export async function saveGiveaway(client, guildId, giveawayData) {
    try {
        const key = giveawayKey(guildId);
        const giveaways = await getGuildGiveaways(client, guildId);

        // Use messageId as the top-level key
        giveaways[giveawayData.messageId] = giveawayData;

        // Save back to database
        await client.db.set(key, giveaways);
        return true;
    } catch (error) {
        console.error("Error saving giveaway:", error);
        return false;
    }
}

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
        console.error("Error deleting giveaway:", error);
        return false;
    }
}

export function giveawayEmbed(giveaway, status, winners = null) {
    const isEnded = status !== "active";
    const color = isEnded
        ? BotConfig.embeds.colors.giveaway.ended
        : BotConfig.embeds.colors.giveaway.active;

    const hostTag = `<@${giveaway.hostId}>`;
    const winnerCount = giveaway.winnerCount;

    // ** 🚩 FIX: Safely read participants length, defaulting to 0 if the array is missing **
    const entriesCount = (giveaway.participants || []).length;
    const prize = giveaway.prize;

    let description = "";
    let title = isEnded ? "🎉 GIVEAWAY ENDED 🎉" : `🎁 GIVEAWAY: ${prize}`;

    if (status === "active") {
        // You are using the original giveaway object, which has 'endTime'
        description = `React with the button below to enter!\n**Ends:** <t:${Math.floor(giveaway.endTime / 1000)}:R> (<t:${Math.floor(giveaway.endTime / 1000)}:f>)\n\n**Winners:** ${winnerCount}\n**Hosted by:** ${hostTag}`;
    } else if (status === "ended" && winners && winners.length > 0) {
        const winnerMentions = winners.map((id) => `<@${id}>`).join(", ");
        description = `The giveaway for **${prize}** has ended!\n\n**Winners:** ${winnerMentions}\n**Hosted by:** ${hostTag}\n\nCongratulations!`;
    } else if (status === "reroll" && winners && winners.length > 0) {
        const winnerMentions = winners.map((id) => `<@${id}>`).join(", ");
        title = "🔄 GIVEAWAY REROLLED 🔄";
        description = `A new winner has been selected for **${prize}**!\n\n**New Winners:** ${winnerMentions}\n**Hosted by:** ${hostTag}\n\nGood luck!`;
    } else {
        description = `The giveaway for **${prize}** has ended with **no valid entries**.\nHosted by: ${hostTag}`;
    }

    const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(description)
        .setColor(color)
        .addFields({
            name: "Entries",
            value: `${entriesCount}`,
            inline: true,
        })
        .setFooter({
            text: BotConfig.embeds.footer.text,
            iconURL: BotConfig.embeds.footer.icon,
        });

    return embed;
}

export function giveawayButtons(isEnded) {
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId("enter_giveaway")
            .setLabel(isEnded ? "Giveaway Ended" : "Enter Giveaway")
            .setStyle(isEnded ? ButtonStyle.Secondary : ButtonStyle.Primary)
            .setEmoji(isEnded ? "🔒" : "🎉")
            .setDisabled(isEnded),
    );
    return row;
}

// ⏰ FORMAT DURATION: Replaced simple version with the robust one from the listener
export function formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    // Calculate remaining parts
    const remainingHours = hours % 24;
    const remainingMinutes = minutes % 60;
    const remainingSeconds = seconds % 60;

    let parts = [];
    if (days > 0) parts.push(`${days} day(s)`);
    if (remainingHours > 0) parts.push(`${remainingHours} hour(s)`);
    if (remainingMinutes > 0) parts.push(`${remainingMinutes} minute(s)`);
    if (parts.length === 0) {
        // If duration is very short, include seconds
        parts.push(`${remainingSeconds} second(s)`);
    }

    // Join the parts with commas and spaces
    return parts.join(", ");
}

export async function getAFKStatus(client, guildId, userId) {
    const afkKey = getAFKKey(guildId, userId);
    try {
        const afkData = await client.db.get(afkKey);
        // Ensure that the AFK data is unwrapped if coming from a nested database structure
        return unwrapReplitData(afkData) || null;
    } catch (error) {
        console.error(`Error retrieving AFK status for user ${userId}:`, error);
        return null;
    }
}

// ====================
// WELCOME SYSTEM UTILS
// ====================

// Guild Member Add Event Handler
export const handleGuildMemberAdd = {
    name: Events.GuildMemberAdd,
    async execute(member) {
        try {
            // Skip if the welcome system is disabled in the bot config
            if (!member.client.config?.features?.welcome) return;
            
            const config = await getWelcomeConfig(member.client, member.guild.id);
            
            // Skip if welcome is disabled for this guild
            if (!config.welcomeEnabled) return;

            // Send welcome message if enabled and channel is set
            if (config.welcomeChannel) {
                const channel = member.guild.channels.cache.get(config.welcomeChannel);
                if (channel) {
                    const welcomeMessage = (config.welcomeMessage || '')
                        .replace(/{user}/g, member.toString())
                        .replace(/{username}/g, member.user.username)
                        .replace(/{server}/g, member.guild.name)
                        .replace(/{memberCount}/g, member.guild.memberCount.toLocaleString());

                    const embed = new EmbedBuilder()
                        .setColor(member.client.config.embeds.colors.primary || '#00ff00')
                        .setDescription(welcomeMessage)
                        .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
                        .setTimestamp();

                    if (config.welcomeImage) {
                        embed.setImage(config.welcomeImage);
                    }

                    const content = config.welcomePing ? member.toString() : null;
                    
                    try {
                        await channel.send({ 
                            content, 
                            embeds: [embed],
                            allowedMentions: { parse: ['users'] }
                        });
                    } catch (error) {
                        console.error(`Failed to send welcome message in ${member.guild.name}:`, error);
                    }
                }
            }

            // Assign auto roles if any are set
            if (Array.isArray(config.autoRoles) && config.autoRoles.length > 0) {
                const roles = config.autoRoles
                    .map(roleId => member.guild.roles.cache.get(roleId))
                    .filter(role => {
                        if (!role) return false;
                        // Make sure the bot can manage this role
                        return member.guild.members.me.roles.highest.position > role.position;
                    });

                if (roles.length > 0) {
                    try {
                        await member.roles.add(roles);
                    } catch (error) {
                        console.error(`Failed to assign auto-roles to ${member.id} in ${member.guild.name}:`, error);
                    }
                }
            }
        } catch (error) {
            console.error('Error in guildMemberAdd event:', error);
        }
    },
};

// Guild Member Remove Event Handler
export const handleGuildMemberRemove = {
    name: Events.GuildMemberRemove,
    async execute(member) {
        try {
            // Skip if the welcome system is disabled in the bot config
            if (!member.client.config?.features?.welcome) return;
            
            const config = await getWelcomeConfig(member.client, member.guild.id);
            
            // Skip if goodbye is disabled or not properly configured
            if (!config.goodbyeEnabled || !config.goodbyeChannel) {
                return;
            }

            const channel = member.guild.channels.cache.get(config.goodbyeChannel);
            if (!channel) return;

            const goodbyeMessage = (config.goodbyeMessage || '')
                .replace(/{user}/g, member.user.tag)
                .replace(/{username}/g, member.user.username)
                .replace(/{server}/g, member.guild.name)
                .replace(/{memberCount}/g, (member.guild.memberCount).toLocaleString());

            const embed = new EmbedBuilder()
                .setColor(member.client.config.embeds.colors.error || '#ff0000')
                .setDescription(goodbyeMessage)
                .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
                .setTimestamp();

            if (config.goodbyeImage) {
                embed.setImage(config.goodbyeImage);
            }

            try {
                await channel.send({ 
                    embeds: [embed],
                    allowedMentions: { parse: [] }
                });
            } catch (error) {
                console.error(`Failed to send goodbye message in ${member.guild.name}:`, error);
            }
        } catch (error) {
            console.error('Error in guildMemberRemove event:', error);
        }
    },
};

// Key generators for welcome system
export const getWelcomeConfigKey = (guildId) => `guild:${guildId}:welcome_config`;

/**
 * Get welcome system configuration for a guild
 * @param {Object} client - The Discord client
 * @param {string} guildId - The ID of the guild
 * @returns {Promise<Object>} The welcome system configuration
 */
export async function getWelcomeConfig(client, guildId) {
    try {
        const key = getWelcomeConfigKey(guildId);
        const config = await client.db.get(key, {});
        
        // Apply defaults from BotConfig with proper type checking and validation
        return {
            welcomeEnabled: Boolean(config.welcomeEnabled ?? BotConfig.welcome?.enabled ?? false),
            welcomeChannel: config.welcomeChannel || BotConfig.welcome?.defaultWelcomeChannel || null,
            welcomeMessage: String(config.welcomeMessage || BotConfig.welcome?.defaultWelcomeMessage || 'Welcome {user} to {server}!').substring(0, 1000),
            welcomeImage: config.welcomeImage || BotConfig.welcome?.defaultWelcomeImage || null,
            welcomePing: Boolean(config.welcomePing ?? BotConfig.welcome?.defaultWelcomePing ?? false),
            
            goodbyeEnabled: Boolean(config.goodbyeEnabled ?? BotConfig.welcome?.enabled ?? false),
            goodbyeChannel: config.goodbyeChannel || BotConfig.welcome?.defaultGoodbyeChannel || null,
            goodbyeMessage: String(config.goodbyeMessage || BotConfig.welcome?.defaultGoodbyeMessage || 'Goodbye {user}!').substring(0, 1000),
            goodbyeImage: config.goodbyeImage || BotConfig.welcome?.defaultGoodbyeImage || null,
            
            autoRoles: Array.isArray(config.autoRoles) ? 
                config.autoRoles.filter(id => typeof id === 'string') : 
                (Array.isArray(BotConfig.welcome?.defaultAutoRoles) ? [...BotConfig.welcome.defaultAutoRoles] : [])
        };
    } catch (error) {
        console.error(`Error getting welcome config for guild ${guildId}:`, error);
        // Return safe defaults
        return {
            welcomeEnabled: false,
            welcomeChannel: null,
            welcomeMessage: 'Welcome {user} to {server}!',
            welcomeImage: null,
            welcomePing: false,
            goodbyeEnabled: false,
            goodbyeChannel: null,
            goodbyeMessage: 'Goodbye {user}!',
            goodbyeImage: null,
            autoRoles: []
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
    try {
        // Validate and sanitize the config
        const sanitizedConfig = {
            welcomeEnabled: Boolean(config.welcomeEnabled),
            welcomeChannel: config.welcomeChannel || null,
            welcomeMessage: String(config.welcomeMessage || '').substring(0, 1000), // Limit to 1000 chars
            welcomeImage: config.welcomeImage ? String(config.welcomeImage) : null,
            welcomePing: Boolean(config.welcomePing),
            
            goodbyeEnabled: Boolean(config.goodbyeEnabled),
            goodbyeChannel: config.goodbyeChannel || null,
            goodbyeMessage: String(config.goodbyeMessage || '').substring(0, 1000), // Limit to 1000 chars
            goodbyeImage: config.goodbyeImage ? String(config.goodbyeImage) : null,
            
            autoRoles: Array.isArray(config.autoRoles) ? 
                config.autoRoles.filter(id => typeof id === 'string') : 
                []
        };

        const key = getWelcomeConfigKey(guildId);
        await client.db.set(key, sanitizedConfig);
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
        const newConfig = { ...currentConfig, ...updates };
        await saveWelcomeConfig(client, guildId, newConfig);
        return newConfig;
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
function getLevelingKey(guildId) {
    return `${guildId}:leveling:config`;
}

/**
 * Gets the user level data key
 * @param {string} guildId - The ID of the guild
 * @param {string} userId - The ID of the user
 * @returns {string} The user level data key
 */
function getUserLevelKey(guildId, userId) {
    return `${guildId}:leveling:user:${userId}`;
}

/**
 * Gets the leveling configuration for a guild
 * @param {Object} client - The Discord client
 * @param {string} guildId - The ID of the guild
 * @returns {Promise<Object>} The leveling configuration
 */
export async function getLevelingConfig(client, guildId) {
    try {
        if (!client.db) {
            console.error("Database not initialized in client");
            return null;
        }
        const key = getLevelingKey(guildId);
        const config = await client.db.get(key);

        // Default configuration
        const defaultConfig = {
            enabled: true,
            xpPerMessage: 15,
            xpCooldown: 60, // seconds
            levelUpChannel: null,
            levelUpMessage: "🎉 {user} has reached level {level}!",
            ignoredChannels: [],
            xpRange: { min: 15, max: 25 },
            blacklistedRoles: [],
        };

        // If no config exists, save the default one
        if (!config) {
            await client.db.set(key, defaultConfig);
            return { ...defaultConfig };
        }

        // Merge with defaults, ensuring all required fields exist
        const mergedConfig = { ...defaultConfig, ...(config || {}) };

        // Ensure xpRange exists and has min/max values
        if (!mergedConfig.xpRange || typeof mergedConfig.xpRange !== "object") {
            mergedConfig.xpRange = { min: 15, max: 25 };
        } else {
            mergedConfig.xpRange = {
                min:
                    typeof mergedConfig.xpRange.min === "number"
                        ? mergedConfig.xpRange.min
                        : 15,
                max:
                    typeof mergedConfig.xpRange.max === "number"
                        ? mergedConfig.xpRange.max
                        : 25,
            };
        }

        return mergedConfig;
    } catch (error) {
        console.error("Error getting leveling config:", error);
        return null;
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
    try {
        if (!client.db) {
            console.error("Database not initialized in client");
            return false;
        }
        const key = getLevelingKey(guildId);
        await client.db.set(key, config);
        return true;
    } catch (error) {
        console.error("Error saving leveling config:", error);
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
    try {
        if (!client.db) {
            console.error("Database not initialized in client");
            return { xp: 0, level: 0, totalXp: 0, lastMessage: 0 };
        }

        const key = getUserLevelKey(guildId, userId);

        const data = await client.db.get(key);

        // Handle nested structure with ok/error properties
        let cleanData = {};
        if (data) {
            // If data has an 'ok' property, it's the response wrapper
            if ("ok" in data) {
                // If there's a value property, use that
                if (data.value && typeof data.value === "object") {
                    cleanData = data.value;
                    // Check if value itself has another nested structure
                    if ("ok" in cleanData && cleanData.value) {
                        cleanData = cleanData.value;
                    }
                }
            } else {
                // No wrapper, use data directly
                cleanData = data;
            }
        }


        // Ensure all required fields exist with defaults
        const result = {
            xp: Number(cleanData.xp) || 0,
            level: Number(cleanData.level) || 0,
            totalXp: Number(cleanData.totalXp) || 0,
            lastMessage: Number(cleanData.lastMessage) || 0,
        };

        return result;
    } catch (error) {
        console.error("Error getting user level data:", error);
        return { xp: 0, level: 0, totalXp: 0, lastMessage: 0 };
    }
}

export async function saveUserLevelData(client, guildId, userId, data) {
    try {
        if (!client.db) {
            console.error("Database not initialized in client");
            return false;
        }

        const key = getUserLevelKey(guildId, userId);

        // Ensure we're only saving the data we want in a flat structure
        const dataToSave = {
            xp: data.xp || 0,
            level: data.level || 0,
            totalXp: data.totalXp || 0,
            lastMessage: data.lastMessage || 0,
        };

        console.log(
            "Saving user level data - Cleaned Data:",
            JSON.stringify(dataToSave, null, 2),
        );

        await client.db.set(key, dataToSave);
        console.log("User level data saved successfully");
        return true;
    } catch (error) {
        console.error("Error saving user level data:", error);
        return false;
    }
}

/**
 * Calculates the XP needed for a specific level
 * @param {number} level - The level to calculate XP for
 * @returns {number} The XP needed for the level
 */
export function getXpForLevel(level) {
    return 5 * Math.pow(level, 2) + 50 * level + 100;
}

/**
 * Calculates the level from a given XP amount
 * @param {number} xp - The XP amount
 * @returns {Object} An object containing level, currentXp, and xpNeeded
 */
export function getLevelFromXp(xp) {
    let level = 0;
    let xpNeeded = getXpForLevel(level);
    let totalXp = xp;

    while (totalXp >= xpNeeded) {
        totalXp -= xpNeeded;
        level++;
        xpNeeded = getXpForLevel(level);
    }

    return {
        level,
        currentXp: totalXp,
        xpNeeded,
    };
}

export async function addXp(client, guild, member, xpToAdd) {
    try {
        if (!client.db) {
            console.error("Database not initialized in client");
            return null;
        }

        const guildId = guild.id;
        const userId = member.id;

        // Get current data
        const userData = await getUserLevelData(client, guildId, userId);
        const config = await getLevelingConfig(client, guildId);

        // Check if leveling is enabled
        if (!config || !config.enabled) {
            console.log("Leveling is disabled for this guild");
            return null;
        }

        // Calculate new XP and check for level up
        const oldLevel = userData.level || 0;
        userData.totalXp = (userData.totalXp || 0) + xpToAdd;
        userData.lastMessage = Date.now();

        const newLevelData = getLevelFromXp(userData.totalXp);
        const didLevelUp = newLevelData.level > oldLevel;

        // Update user data
        userData.level = newLevelData.level;
        userData.xp = newLevelData.currentXp;

        // Save updated data
        await saveUserLevelData(client, guildId, userId, userData);

        // Handle level up
        if (didLevelUp) {
            let levelUpChannel = null;

            // Try to get the configured level up channel
            if (config.levelUpChannel) {
                levelUpChannel = guild.channels.cache.get(
                    config.levelUpChannel,
                );
            }

            // If no channel is set or it wasn't found, use the current channel
            if (!levelUpChannel) {
                levelUpChannel =
                    guild.channels.cache.find(
                        (c) =>
                            c.type === "GUILD_TEXT" &&
                            c.permissionsFor(guild.me).has("SEND_MESSAGES"),
                    ) || guild.systemChannel;
            }

            // Send level up message if we have a channel
            if (levelUpChannel) {
                const levelUpMessage = (
                    config.levelUpMessage ||
                    "🎉 {user} has reached level {level}!"
                )
                    .replace(/{user}/g, member.toString())
                    .replace(/{level}/g, userData.level);

                levelUpChannel.send(levelUpMessage).catch(console.error);
            }

            return {
                oldLevel,
                newLevel: userData.level,
                userData,
                member,
                config,
                levelUpChannel: levelUpChannel?.id,
            };
        }

        return {
            oldLevel,
            newLevel: userData.level,
            userData,
            member,
            config,
            levelUp: false,
        };
    } catch (error) {
        console.error("Error in addXp:", error);
        return null;
    }
}

/**
 * Gets the leaderboard for a guild
 * @param {Object} client - The Discord client
 * @param {string} guildId - The ID of the guild
 * @param {number} limit - Maximum number of entries to return (default: 10)
 * @returns {Promise<Array>} Sorted array of user level data
 */
export async function getLeaderboard(client, guildId, limit = 10) {
    console.log("Guild ID:", guildId);

    // Debug database connection
    console.log("Client DB instance:", client.db ? "Exists" : "Missing");

    if (!client.db) {
        console.error("❌ Database not initialized in client");
        // Check if we can access the database directly
        try {
            console.log("Attempting to access global database...");
            const db = new Database();
            console.log("✅ Successfully created new database instance");
            client.db = db; // Try to fix the client's db reference
        } catch (dbError) {
            console.error("❌ Failed to initialize database:", dbError);
            return [];
        }
    }

    const prefix = `${guildId}:leveling:user:`;
    console.log("Searching for keys with prefix:", prefix);

    try {
        let allKeys = [];

        // First, try to get all keys and filter them manually
        try {
            console.log("Fetching all keys from database...");

            // Try to access the database directly if available
            const db = client.db;
            console.log(
                "Database instance type:",
                db?.constructor?.name || "Unknown",
            );

            // Try different methods to list keys
            let allDbKeys = [];

            try {
                console.log("Attempting to use list() method...");
                const response = await db.list();
                console.log(
                    "Raw database response:",
                    JSON.stringify(response, null, 2),
                );

                // Handle both wrapped and direct array responses
                if (
                    response &&
                    typeof response === "object" &&
                    "value" in response &&
                    Array.isArray(response.value)
                ) {
                    console.log(
                        `✅ Found ${response.value.length} keys in wrapped response`,
                    );
                    allDbKeys = response.value;
                } else if (Array.isArray(response)) {
                    console.log(
                        `✅ Found ${response.length} keys in direct array response`,
                    );
                    allDbKeys = response;
                } else {
                    console.error(
                        "❌ Unexpected response format from database",
                    );
                    return [];
                }

                console.log(
                    `✅ Successfully retrieved ${allDbKeys.length} keys`,
                );
            } catch (listError) {
                console.error("❌ Error listing keys:", listError);
                return [];
            }

            console.log(`Total keys in database: ${allDbKeys.length}`);

            // Filter keys that match our prefix
            allKeys = allDbKeys.filter((key) => key.startsWith(prefix));
            console.log(
                `✅ Found ${allKeys.length} keys matching prefix ${prefix}`,
            );

            if (allKeys.length > 0) {
                console.log(
                    "Sample keys:",
                    allKeys.slice(0, Math.min(3, allKeys.length)),
                );
            } else {
                // If no keys found with prefix, show some sample keys for debugging
                console.log(
                    "No keys found with prefix. Sample of all keys:",
                    allDbKeys.slice(0, Math.min(5, allDbKeys.length)),
                );
            }
        } catch (error) {
            console.error("❌ Error accessing database:", error);
            return [];
        }

        if (allKeys.length === 0) {
            console.log("⚠️ No user data found for leaderboard");
            return [];
        }

        // Process all user data in parallel
        const userPromises = allKeys.map(async (key) => {
            try {
                const userId = key.replace(prefix, "");
                const rawData = await client.db.get(key);
                const userData = unwrapReplitData(rawData);

                if (userData && (userData.level > 0 || userData.xp > 0)) {
                    return {
                        userId,
                        level: userData.level || 0,
                        xp: userData.xp || 0,
                        totalXp: userData.totalXp || 0,
                        lastMessage: userData.lastMessage || 0,
                    };
                }
            } catch (error) {
                console.error(
                    `Error processing user data for key ${key}:`,
                    error,
                );
                return null;
            }
            return null;
        });

        // Wait for all user data to be processed and filter out nulls
        const users = (await Promise.all(userPromises)).filter(
            (user) => user !== null,
        );

        console.log(`Processed ${users.length} users for leaderboard`);

        if (users.length === 0) {
            console.log("No valid user data found after processing");
            return [];
        }

        // Sort by level (descending) and then by XP (descending)
        const sortedLeaderboard = users.sort((a, b) => {
            if (a.level !== b.level) {
                return b.level - a.level;
            }
            return b.xp - a.xp;
        });

        console.log("Leaderboard entries:", sortedLeaderboard);
        return sortedLeaderboard.slice(0, limit);
    } catch (error) {
        console.error("Error in getLeaderboard:", error);
        return [];
    }
}

// ... (rest of the code remains the same)
export async function debugGetRawUserData(client, guildId, userId) {
    try {
        if (!client.db) {
            console.error("Database not initialized in client");
            return null;
        }
        const key = getUserLevelKey(guildId, userId);
        const data = await client.db.get(key);
        console.log(
            JSON.stringify(data, null, 2),
        );
        return data;
    } catch (error) {
        console.error("Error in debugGetRawUserData:", error);
        return null;
    }
}
/**
 * Generates a consistent key for ticket data in the database
 * @param {string} guildId - The ID of the guild
 * @param {string} channelId - The ID of the ticket channel
 * @returns {string} The formatted key
 */
export function getTicketKey(guildId, channelId) {
    return `${guildId}:ticket:${channelId}`;
}

/**
 * Logs an event to the configured log channel
 * @param {Object} options - The log options
 * @param {import('discord.js').Client} options.client - The Discord client
 * @param {string} options.guildId - The ID of the guild
 * @param {Object} options.event - The event details
 * @param {string} options.event.action - The action that was taken
 * @param {string} options.event.target - The target of the action
 * @param {string} options.event.executor - The user who performed the action
 * @param {string} [options.event.reason] - The reason for the action
 * @param {string} [options.event.duration] - The duration of the action (for timeouts)
 * @returns {Promise<void>}
 */
export async function logEvent({ client, guildId, event }) {
    try {
        // Get the guild configuration
        const guild = client.guilds.cache.get(guildId);
        if (!guild) return;

        const config = await client.getGuildConfig(guildId);
        if (!config?.logChannelId) return;

        const logChannel = guild.channels.cache.get(config.logChannelId);
        if (!logChannel) return;

        // Create the embed
        const embed = new EmbedBuilder()
            .setColor(BotConfig.colors.primary || "#0099ff")
            .setTitle(`🔨 ${event.action}`)
            .addFields(
                { name: "Target", value: event.target, inline: true },
                { name: "Moderator", value: event.executor, inline: true },
            )
            .setTimestamp();

        if (event.reason) {
            embed.addFields({
                name: "Reason",
                value: event.reason,
                inline: false,
            });
        }

        if (event.duration) {
            embed.addFields({
                name: "Duration",
                value: event.duration,
                inline: true,
            });
        }

        // Send the log message
        await logChannel.send({ embeds: [embed] });
    } catch (error) {
        console.error("Error logging event:", error);
    }
}

// --- APPLICATION SYSTEM UTILITIES ---

/**
 * Gets the key for storing application settings in the database
 * @param {string} guildId - The guild ID
 * @returns {string} The database key
 */
function getApplicationSettingsKey(guildId) {
    return `app_settings_${guildId}`;
}

/**
 * Gets the key for storing user applications in the database
 * @param {string} guildId - The guild ID
 * @param {string} userId - The user ID
 * @returns {string} The database key
 */
function getUserApplicationsKey(guildId, userId) {
    return `user_apps_${guildId}_${userId}`;
}

/**
 * Gets the key for a specific application in the database
 * @param {string} guildId - The guild ID
 * @param {string} applicationId - The application ID
 * @returns {string} The database key
 */
function getApplicationKey(guildId, applicationId) {
    return `app_${guildId}_${applicationId}`;
}

/**
 * Gets the application settings for a guild
 * @param {Object} client - The Discord client
 * @param {string} guildId - The guild ID
 * @returns {Promise<Object>} The application settings
 */
export async function getApplicationSettings(client, guildId) {
    try {
        const key = getApplicationSettingsKey(guildId);
        const settings = await client.db.get(key);
        
        // Return default settings if none exist
        if (!settings) {
            const defaultSettings = {
                questions: BotConfig.applications?.defaultQuestions || [],
                logChannelId: null,
                managerRoles: [],
                enabled: true,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            await client.db.set(key, defaultSettings);
            return defaultSettings;
        }
        
        return settings;
    } catch (error) {
        console.error('Error getting application settings:', error);
        throw error;
    }
}

/**
 * Saves the application settings for a guild
 * @param {Object} client - The Discord client
 * @param {string} guildId - The guild ID
 * @param {Object} settings - The settings to save
 * @returns {Promise<boolean>} Whether the operation was successful
 */
export async function saveApplicationSettings(client, guildId, settings) {
    try {
        const key = getApplicationSettingsKey(guildId);
        const currentSettings = await getApplicationSettings(client, guildId);
        
        // Merge with existing settings and update timestamps
        const updatedSettings = {
            ...currentSettings,
            ...settings,
            updatedAt: new Date().toISOString()
        };
        
        await client.db.set(key, updatedSettings);
        return true;
    } catch (error) {
        console.error('Error saving application settings:', error);
        throw error;
    }
}

/**
 * Creates a new application
 * @param {Object} client - The Discord client
 * @param {Object} application - The application data
 * @returns {Promise<Object>} The created application
 */
export async function createApplication(client, application) {
    try {
        const { guildId, userId } = application;
        const applicationId = `app_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        const newApplication = {
            ...application,
            id: applicationId,
            status: 'pending',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        
        // Save the application
        const appKey = getApplicationKey(guildId, applicationId);
        await client.db.set(appKey, newApplication);
        
        // Add to user's applications list
        const userAppsKey = getUserApplicationsKey(guildId, userId);
        const userApps = (await client.db.get(userAppsKey)) || [];
        userApps.push({
            id: applicationId,
            status: 'pending',
            createdAt: newApplication.createdAt,
            role: application.role
        });
        await client.db.set(userAppsKey, userApps);
        
        return newApplication;
    } catch (error) {
        console.error('Error creating application:', error);
        throw error;
    }
}

/**
 * Gets a specific application by ID
 * @param {Object} client - The Discord client
 * @param {string} guildId - The guild ID
 * @param {string} applicationId - The application ID
 * @returns {Promise<Object|null>} The application or null if not found
 */
export async function getApplication(client, guildId, applicationId) {
    try {
        const key = getApplicationKey(guildId, applicationId);
        return await client.db.get(key);
    } catch (error) {
        console.error('Error getting application:', error);
        throw error;
    }
}

/**
 * Updates an application
 * @param {Object} client - The Discord client
 * @param {string} guildId - The guild ID
 * @param {string} applicationId - The application ID
 * @param {Object} updates - The updates to apply
 * @returns {Promise<Object>} The updated application
 */
export async function updateApplication(client, guildId, applicationId, updates) {
    try {
        const key = getApplicationKey(guildId, applicationId);
        const application = await getApplication(client, guildId, applicationId);
        
        if (!application) {
            throw new Error('Application not found');
        }
        
        const updatedApplication = {
            ...application,
            ...updates,
            updatedAt: new Date().toISOString()
        };
        
        await client.db.set(key, updatedApplication);
        
        // Update user's applications list if status changed
        if (updates.status) {
            const userAppsKey = getUserApplicationsKey(guildId, application.userId);
            const userApps = (await client.db.get(userAppsKey)) || [];
            const appIndex = userApps.findIndex(app => app.id === applicationId);
            
            if (appIndex !== -1) {
                userApps[appIndex] = {
                    ...userApps[appIndex],
                    status: updates.status,
                    updatedAt: updatedApplication.updatedAt
                };
                await client.db.set(userAppsKey, userApps);
            }
        }
        
        return updatedApplication;
    } catch (error) {
        console.error('Error updating application:', error);
        throw error;
    }
}

/**
 * Gets all applications for a user in a guild
 * @param {Object} client - The Discord client
 * @param {string} guildId - The guild ID
 * @param {string} userId - The user ID
 * @returns {Promise<Array>} The user's applications
 */
export async function getUserApplications(client, guildId, userId) {
    try {
        const key = getUserApplicationsKey(guildId, userId);
        return (await client.db.get(key)) || [];
    } catch (error) {
        console.error('Error getting user applications:', error);
        throw error;
    }
}

/**
 * Gets all applications in a guild with optional filters
 * @param {Object} client - The Discord client
 * @param {string} guildId - The guild ID
 * @param {Object} [filters] - Optional filters
 * @param {string} [filters.status] - Filter by status
 * @param {string} [filters.role] - Filter by role ID
 * @returns {Promise<Array>} The filtered applications
 */
export async function getApplications(client, guildId, filters = {}) {
    try {
        // This is a simplified implementation - in a production environment,
        // you might want to use a more sophisticated query system or a different database
        const prefix = `app_${guildId}_`;
        const allKeys = (await client.db.list(prefix)) || [];
        const applications = [];
        
        for (const key of allKeys) {
            try {
                const app = await client.db.get(key);
                if (app) {
                    let matches = true;
                    
                    // Apply filters
                    if (filters.status && app.status !== filters.status) {
                        matches = false;
                    }
                    
                    if (filters.role && app.role !== filters.role) {
                        matches = false;
                    }
                    
                    if (matches) {
                        applications.push(app);
                    }
                }
            } catch (error) {
                console.error(`Error fetching application with key ${key}:`, error);
            }
        }
        
        // Sort by creation date (newest first)
        return applications.sort((a, b) => 
            new Date(b.createdAt) - new Date(a.createdAt)
        );
    } catch (error) {
        console.error('Error getting applications:', error);
        throw error;
    }
}

// --- INVITE TRACKING FUNCTIONS ---

// Key generators for invite tracking
function getInviteTrackingKey(guildId) {
    return `invite_tracking:${guildId}`;
}

function getMemberInvitesKey(guildId, userId) {
    return `member_invites:${guildId}:${userId}`;
}

function getInviteUsesKey(guildId, inviteCode) {
    return `invite_uses:${guildId}:${inviteCode}`;
}

function getFakeAccountKey(guildId, userId) {
    return `fake_account:${guildId}:${userId}`;
}

// Track when a member joins using an invite
export async function trackInviteJoin(client, guildId, member, invite) {
    const now = Date.now();
    const joinData = {
        userId: member.id,
        inviterId: invite.inviterId || 'unknown',
        inviteCode: invite.code,
        joinedAt: now,
        isFake: false,
        left: false,
        leftAt: null
    };

    // Store the join record
    const joinKey = `invite_join:${guildId}:${member.id}`;
    await client.db.set(joinKey, joinData);

    // Update inviter's stats
    if (invite.inviterId) {
        const inviterKey = getMemberInvitesKey(guildId, invite.inviterId);
        const inviterData = await client.db.get(inviterKey, { invites: [], total: 0, leaves: 0, fake: 0 });
        
        inviterData.invites.push({
            userId: member.id,
            inviteCode: invite.code,
            joinedAt: now,
            isFake: false
        });
        inviterData.total++;
        
        await client.db.set(inviterKey, inviterData);
    }

    // Track invite uses
    const inviteUsesKey = getInviteUsesKey(guildId, invite.code);
    const inviteUses = await client.db.get(inviteUsesKey, { uses: 0, users: [] });
    inviteUses.uses++;
    inviteUses.users.push({
        userId: member.id,
        joinedAt: now,
        left: false
    });
    await client.db.set(inviteUsesKey, inviteUses);

    return joinData;
}

// Mark a member as having left the server
export async function trackMemberLeave(client, guildId, userId) {
    const joinKey = `invite_join:${guildId}:${userId}`;
    const joinData = await client.db.get(joinKey);
    
    if (joinData) {
        joinData.left = true;
        joinData.leftAt = Date.now();
        await client.db.set(joinKey, joinData);

        // Update inviter's leave count if applicable
        if (joinData.inviterId && joinData.inviterId !== 'unknown') {
            const inviterKey = getMemberInvitesKey(guildId, joinData.inviterId);
            const inviterData = await client.db.get(inviterKey, { invites: [], total: 0, leaves: 0, fake: 0 });
            inviterData.leaves++;
            await client.db.set(inviterKey, inviterData);
        }
    }
}

// Mark an account as potentially fake
export async function markAsFakeAccount(client, guildId, userId) {
    const joinKey = `invite_join:${guildId}:${userId}`;
    const joinData = await client.db.get(joinKey);
    
    if (joinData && !joinData.left) {
        joinData.isFake = true;
        await client.db.set(joinKey, joinData);

        // Update inviter's fake count if applicable
        if (joinData.inviterId && joinData.inviterId !== 'unknown') {
            const inviterKey = getMemberInvitesKey(guildId, joinData.inviterId);
            const inviterData = await client.db.get(inviterKey, { invites: [], total: 0, leaves: 0, fake: 0 });
            inviterData.fake++;
            await client.db.set(inviterKey, inviterData);
        }
    }

    // Also mark in the fake accounts list
    const fakeKey = getFakeAccountKey(guildId, userId);
    await client.db.set(fakeKey, { markedAt: Date.now() });
}

// Get a member's invite stats
export async function getMemberInviteStats(client, guildId, userId) {
    const inviterKey = getMemberInvitesKey(guildId, userId);
    const data = await client.db.get(inviterKey, { invites: [], total: 0, leaves: 0, fake: 0 });
    
    // Calculate valid invites (total - leaves - fake)
    const valid = Math.max(0, data.total - data.leaves - data.fake);
    
    return {
        total: data.total,
        leaves: data.leaves,
        fake: data.fake,
        valid,
        invites: data.invites
    };
}

// Get detailed invite information
export async function getInviteDetails(client, guildId, inviteCode) {
    const inviteUsesKey = getInviteUsesKey(guildId, inviteCode);
    const inviteUses = await client.db.get(inviteUsesKey, { uses: 0, users: [] });
    
    // Get more details about each user who used the invite
    const detailedUsers = [];
    
    for (const user of inviteUses.users) {
        try {
            const member = await client.guilds.cache.get(guildId)?.members.fetch(user.userId).catch(() => null);
            detailedUsers.push({
                ...user,
                tag: member?.user.tag || 'Unknown User',
                avatar: member?.user.displayAvatarURL({ dynamic: true }),
                joinedAt: member?.joinedAt || null,
                left: !member
            });
        } catch (error) {
            console.error(`Error fetching user ${user.userId}:`, error);
        }
    }
    
    return {
        code: inviteCode,
        uses: inviteUses.uses,
        users: detailedUsers
    };
}

// Get guild invite leaderboard
export async function getInviteLeaderboard(client, guildId, limit = 10) {
    // Get all member invite keys
    const prefix = `member_invites:${guildId}`;
    const keys = await client.db.list(prefix);
    
    // Get all invite data
    const leaderboard = [];
    
    for (const key of keys) {
        const userId = key.split(':').pop();
        const data = await client.db.get(key);
        
        if (data) {
            const valid = Math.max(0, data.total - data.leaves - data.fake);
            leaderboard.push({
                userId,
                total: data.total,
                leaves: data.leaves,
                fake: data.fake,
                valid,
                lastUpdated: data.lastUpdated || 0
            });
        }
    }
    
    // Sort by valid invites (descending)
    leaderboard.sort((a, b) => b.valid - a.valid || b.total - a.total);
    
    // Get member details for the top entries
    const guild = client.guilds.cache.get(guildId);
    const leaderboardWithNames = [];
    
    for (let i = 0; i < Math.min(limit, leaderboard.length); i++) {
        const entry = leaderboard[i];
        try {
            const member = await guild.members.fetch(entry.userId).catch(() => null);
            leaderboardWithNames.push({
                ...entry,
                tag: member?.user.tag || 'Unknown User',
                position: i + 1
            });
        } catch (error) {
            console.error(`Error fetching member ${entry.userId}:`, error);
        }
    }
    
    return leaderboardWithNames;
}

// --- ECONOMY FUNCTIONS ---

// Use bank capacity from config
const BASE_BANK_CAPACITY = BotConfig.economy.baseBankCapacity;
const BANK_CAPACITY_TIERS = {
    // These keys must match your shop_config.js keys
    bank_upgrade_1: 250000, // New max capacity: $250,000
    bank_upgrade_2: 1000000, // New max capacity: $1,000,000
};
// -------------------------------

// Helper function to calculate the user's maximum bank capacity
export function getMaxBankCapacity(userData) {
    const upgrades = userData.upgrades || {};

    let maxCapacity = BASE_BANK_CAPACITY;

    // Check for Bank Upgrade II first, as it's the highest tier
    if (upgrades["bank_upgrade_2"]) {
        maxCapacity = BANK_CAPACITY_TIERS["bank_upgrade_2"];
    }
    // If Bank Upgrade I is present, but II is not
    else if (upgrades["bank_upgrade_1"]) {
        maxCapacity = BANK_CAPACITY_TIERS["bank_upgrade_1"];
    }

    return maxCapacity;
}

// Existing functions (Modified default structure for cooldowns)
export async function getEconomyData(client, guildId, userId) {
    const key = getEconomyKey(guildId, userId);
    const defaultData = {
        cash: 0,
        bank: 0,
        inventory: {},
        upgrades: {},
        lastBeg: 0,
        cooldowns: {
            daily: 0,
            work: 0,
            // 💰 NEW: Added gamble and rob cooldowns to default structure
            Gamble: 0,
            rob: 0,
        },
    };
    const rawData = await client.db.get(key, defaultData);
    const cleanedData = unwrapReplitData(rawData);

    // Merge cleaned data with defaults to ensure all keys exist
    return {
        ...defaultData,
        ...cleanedData,
        cooldowns: {
            ...defaultData.cooldowns,
            ...(cleanedData.cooldowns || {}),
        },
    };
}

export async function setEconomyData(client, guildId, userId, newData) {
    const key = getEconomyKey(guildId, userId);
    await client.db.set(key, newData);
}

/**
 * Create a new embed with default styling from config
 * @param {string} title - The title of the embed
 * @param {string} [description=''] - The description of the embed
 * @param {string} [color] - Custom color (defaults to primary color)
 * @returns {EmbedBuilder}
 */
export function createEmbed(title, description = "", color) {
    const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(description)
        .setColor(color || getColor("primary"))
        .setTimestamp();

    // Add footer if configured
    if (BotConfig.embeds.footer) {
        embed.setFooter({
            text: BotConfig.embeds.footer.text || "",
            iconURL: BotConfig.embeds.footer.icon || undefined,
        });
    }

    // Add author if configured
    if (BotConfig.embeds.author?.name) {
        embed.setAuthor({
            name: BotConfig.embeds.author.name,
            iconURL: BotConfig.embeds.author.icon || undefined,
            url: BotConfig.embeds.author.url || undefined,
        });
    }

    // Add thumbnail if configured
    if (BotConfig.embeds.thumbnail) {
        embed.setThumbnail(BotConfig.embeds.thumbnail);
    }

    return embed;
}

/**
 * Create a success embed with default styling
 * @param {string} title - The title of the embed
 * @param {string} [description=''] - The description of the embed
 * @returns {EmbedBuilder}
 */
export function successEmbed(title, description = "") {
    return createEmbed(`✅ ${title}`, description, getColor("success"));
}

/**
 * Create an error embed with default styling
 * @param {string} title - The title of the embed
 * @param {string} [description] - The description of the embed (defaults to error message from config)
 * @returns {EmbedBuilder}
 */
export function errorEmbed(
    title,
    description = BotConfig.messages.errorOccurred,
) {
    return createEmbed(`❌ ${title}`, description, getColor("error"));
}

export function getPromoRow() {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setLabel("Learn from the Creator")
            .setStyle(ButtonStyle.Link)
            .setURL("https://www.youtube.com/@Touchpointdiscord"),
    );
}

export function isTicketChannel(channel) {
    if (!channel || channel.type !== ChannelType.GuildText) return null;

    const topic = channel.topic;

    if (topic && /^\d{17,20}$/.test(topic)) {
        // The topic is just the opener's ID
        return topic;
    }

    return null;
}

export async function getTicketMessage(channel) {
    if (channel.type !== ChannelType.GuildText) return null;

    try {
        // Fetch only the first message (which is the ticket embed)
        const messages = await channel.messages.fetch({ limit: 1 });
        return messages.first() || null;
    } catch (e) {
        console.error("Failed to fetch ticket message:", e);
        return null;
    }
}

export function getClaimerIdFromEmbed(message) {
    if (!message || message.embeds.length === 0) return null;

    const embed = message.embeds[0];

    // Check if the embed title indicates a closed state
    if (embed.title?.includes("Closed")) return null;

    // Look for the "Claimed By" field
    const claimedField = embed.fields?.find(
        (field) => field.name === "Claimed By",
    );

    if (!claimedField) return null;

    // Extract the user ID from the field value, which is usually a mention (<@ID>) or text
    const match = claimedField.value.match(/<@!?(\d+)>|(\d+)/);

    // Returns the ID if matched, otherwise null
    return match ? match[1] || match[2] : null;
}

export async function getTicketStatus(channel) {
    const isTicket = isTicketChannel(channel) !== null;
    if (!isTicket) {
        return {
            isTicket: false,
            isClosed: true, // Treat non-ticket channels as implicitly closed
            claimerId: null,
            message: null,
        };
    }

    const message = await getTicketMessage(channel);
    if (!message) {
        return {
            isTicket: true,
            isClosed: false,
            claimerId: null,
            message: null,
        };
    }

    const claimerId = getClaimerIdFromEmbed(message);
    const isClosed = message.embeds[0]?.title?.includes("Closed") || false;

    return {
        isTicket: true,
        isClosed,
        claimerId,
        message,
    };
}

export async function updateTicketMessage(
    channel,
    isClaimed = false,
    claimer = null,
    isClosed = false,
    closer = null,
    // 💡 NEW PARAMETER: Priority level string ('urgent', 'low', etc.)
    priority = null,
) {
    const message = await getTicketMessage(channel);
    if (!message) return;

    let newEmbed;
    const newActionRow = new ActionRowBuilder();

    // --- Determine Current Priority ---
    let currentPriority = priority;
    const existingEmbed = message.embeds[0];

    // If no priority is passed, try to infer from the existing embed to persist the state.
    if (!currentPriority && existingEmbed) {
        // Look for the "Priority" field in the existing embed
        const priorityField = existingEmbed.fields?.find((field) =>
            field.name.includes("Priority"),
        );
        if (priorityField) {
            // Attempt to reverse map the field value (e.g., "🔴 URGENT") to the key ("urgent")
            const valueMatch = priorityField.value.match(
                /\b(urgent|high|medium|low|none)\b/i,
            );

            if (valueMatch && PRIORITY_MAP[valueMatch[0].toLowerCase()]) {
                currentPriority = valueMatch[0].toLowerCase();
            } else {
                // If it's just the display name (e.g., "URGENT"), look for a match
                for (const key in PRIORITY_MAP) {
                    if (
                        priorityField.value.includes(
                            PRIORITY_MAP[key].name.split(" ")[1],
                        )
                    ) {
                        currentPriority = key;
                        break;
                    }
                }
            }
        }
    }

    const priorityInfo = currentPriority ? PRIORITY_MAP[currentPriority] : null;
    const priorityField = priorityInfo
        ? { name: "⚠️ Priority", value: priorityInfo.name, inline: true }
        : null;

    // --- Closed State ---
    if (isClosed) {
        newEmbed = createEmbed(
            "❌ Ticket Closed",
            `This support ticket has been closed by ${closer || "a moderator"}.`,
        )
            .setColor(BotConfig.embeds.colors.ticket.closed)
            .addFields(
                ...(priorityField ? [priorityField] : []), // Add Priority field if it exists
                {
                    name: "Closed By",
                    value: closer ? closer.toString() : "Unknown",
                    inline: true,
                },
            )
            .setFooter({ text: existingEmbed?.footer?.text || "" });

        newActionRow.addComponents(
            new ButtonBuilder()
                .setCustomId("closed_marker")
                .setLabel("Ticket Closed")
                .setStyle(ButtonStyle.Secondary)
                .setEmoji("🔒")
                .setDisabled(true),
        );
    }
    // --- Claimed State (Open/Unclosed) ---
    else if (isClaimed) {
        newEmbed = createEmbed(
            "✅ Ticket Claimed",
            `This ticket is now assigned to ${claimer || "a moderator"}. Please wait for assistance!`,
        )
            // Use priority color if set, otherwise success color
            .setColor(
                priorityInfo
                    ? priorityInfo.color
                    : BotConfig.embeds.colors.success,
            )
            .addFields(
                ...(priorityField ? [priorityField] : []), // Add Priority field
                {
                    name: "Claimed By",
                    value: claimer ? claimer.toString() : "Unknown",
                    inline: true,
                },
            )
            .setFooter({ text: existingEmbed?.footer?.text || "" });

        newActionRow.addComponents(
            // The Claim button is replaced with a permanent status marker
            new ButtonBuilder()
                .setCustomId("claimed_status")
                .setLabel(`Claimed by ${claimer?.username || "Mod"}`)
                .setStyle(ButtonStyle.Secondary)
                .setEmoji("✅")
                .setDisabled(true),
            // *** REMOVED: Unclaim button removed to force command-only unclaim ***
            new ButtonBuilder()
                .setCustomId("close_ticket")
                .setLabel("Close Ticket")
                .setStyle(ButtonStyle.Danger)
                .setEmoji("🔒"),
        );
    }
    // --- Open/Unclaimed State (Default) ---
    else {
        // Use channel topic as opener ID if available
        const openerUser =
            channel.client.users.cache.get(channel.topic) || "User";

        // Prepare the base fields (if any exist besides the priority)
        const baseFields = [];
        if (priorityField) {
            baseFields.push(priorityField);
        }

        newEmbed = createEmbed(
            "📝 New Support Ticket Opened",
            `${openerUser}, welcome! Please describe your issue here.
            \n**Moderators:** Click the button below to claim this ticket and assist the user.`,
        )
            // Use priority color if set, otherwise ticket open color
            .setColor(
                priorityInfo
                    ? priorityInfo.color
                    : BotConfig.embeds.colors.ticket.open,
            )
            .addFields(baseFields)
            .setFooter({ text: existingEmbed?.footer?.text || "" });

        newActionRow.addComponents(
            new ButtonBuilder()
                .setCustomId("claim_ticket")
                .setLabel("Claim Ticket")
                .setStyle(ButtonStyle.Success)
                .setEmoji("🙋"),
            new ButtonBuilder()
                .setCustomId("close_ticket")
                .setLabel("Close Ticket")
                .setStyle(ButtonStyle.Danger)
                .setEmoji("🔒"),
        );
    }

    // Edit the message
    await message
        .edit({
            embeds: [newEmbed],
            components: [newActionRow],
        })
        .catch((e) =>
            console.error("Failed to edit ticket message for sync:", e),
        );
}

// In utils.js - Add these functions

/**
 * Get all server counters
 * @param {string} guildId - The guild ID
 * @returns {Promise<Array>} Array of counter objects
 */
export async function getServerCounters(client, guildId) {
    try {
        const key = `${guildId}:serverstats:counters`;
        
        // Get all keys for debugging
        try {
            const allKeys = await client.db.list();
        } catch (e) {
        }
        
        const response = await client.db.get(key);
        
        // Handle the database response format
        let counters = [];
        if (response) {
            // Check if the response has a value property (Replit DB format)
            if (typeof response === 'object' && 'value' in response) {
                counters = response.value || [];
            } else if (Array.isArray(response)) {
                counters = response;
            }
        }
        
        
        // Ensure we always return an array
        const result = Array.isArray(counters) ? counters : [];
        return result;
    } catch (error) {
        console.error("Error getting server counters:", error);
        return [];
    }
}

/**
 * Save server counters
 * @param {string} guildId - The guild ID
 * @param {Array} counters - Array of counter objects
 */
export async function saveServerCounters(client, guildId, counters) {
    try {
        if (!Array.isArray(counters)) {
            console.error('Attempted to save non-array counters:', counters);
            return false;
        }
        
        const key = `${guildId}:serverstats:counters`;
        
        // Save the counters directly as an array
        await client.db.set(key, counters);
        
        // Verify the save worked
        const response = await client.db.get(key);
        
        // Handle the response format
        let savedCounters = [];
        if (response) {
            if (typeof response === 'object' && 'value' in response) {
                savedCounters = response.value || [];
            } else if (Array.isArray(response)) {
                savedCounters = response;
            }
        }
        
        
        if (!Array.isArray(savedCounters) || savedCounters.length !== counters.length) {
            return false;
        }
        
        return true;
    } catch (error) {
        console.error("Error saving server counters:", error);
        return false;
    }
}

/**
 * Update a specific counter
 * @param {Client} client - Discord client
 * @param {Guild} guild - The guild
 * @param {Object} counter - The counter to update
 */
export async function updateCounter(client, guild, counter) {
    try {
        const { type, channelId } = counter;
        const channel = guild.channels.cache.get(channelId);
        if (!channel) return false;

        let count;
        switch (type) {
            case "members":
                count = guild.memberCount;
                break;
            case "bots":
                count = guild.members.cache.filter((m) => m.user.bot).size;
                break;
            case "members_only":
                count = guild.members.cache.filter((m) => !m.user.bot).size;
                break;
            default:
                return false;
        }

        // Get the base name without any existing count
        const baseName = channel.name.replace(/\s*\[\d+\]\s*$/, '').trim();
        
        // Create new name with count
        const newName = `${baseName} [${count}]`;
        
        // Only update if the name would change
        if (channel.name !== newName) {
            try {
                await channel.setName(newName);
            } catch (error) {
                console.error(`Failed to update channel name for ${channel.id}:`, error);
                return false;
            }
        }
        return true;
    } catch (error) {
        console.error("Error updating counter:", error);
        return false;
    }
}
/**
 * Handles reaction role interactions
 * @param {import('discord.js').Interaction} interaction - The interaction to handle
 * @returns {Promise<boolean>} Whether the interaction was handled
 */
export async function handleReactionRoles(interaction) {
    if (
        !interaction.isStringSelectMenu() ||
        interaction.customId !== "reaction_roles"
    )
        return false;

    try {
        await interaction.deferReply({ ephemeral: true });

        // Get the reaction role data from the database
        const messageId = interaction.message.id;
        console.log(
            `[ReactionRoles] Processing interaction for message ID: ${messageId}`,
        );

        // Get the reaction role data
        const dbResponse = await interaction.client.db.get(
            `reaction_roles_${messageId}`,
        );
        console.log(`[ReactionRoles] Database response:`, dbResponse);

        // Handle the database response format
        const reactionRoleData = dbResponse?.value || dbResponse;
        console.log(
            `[ReactionRoles] Processed reaction role data:`,
            reactionRoleData,
        );

        if (
            !reactionRoleData ||
            !reactionRoleData.roles ||
            !Array.isArray(reactionRoleData.roles)
        ) {
            console.error(
                `[ReactionRoles] Invalid or missing reaction role data for message ${messageId}`,
                {
                    hasData: !!reactionRoleData,
                    hasRoles: !!reactionRoleData?.roles,
                    isArray: Array.isArray(reactionRoleData?.roles),
                    fullData: reactionRoleData,
                },
            );
            await interaction.editReply({
                embeds: [
                    errorEmbed(
                        "Error",
                        "This reaction role message is no longer valid or is misconfigured.",
                    ),
                ],
            });
            return true;
        }

        const member = interaction.member;
        const addedRoles = [];
        const removedRoles = [];

        // Handle role assignments
        for (const roleId of reactionRoleData.roles) {
            try {
                const role = await interaction.guild.roles.fetch(roleId);
                if (!role) continue;

                if (interaction.values.includes(roleId)) {
                    // Role is selected but member doesn't have it
                    if (!member.roles.cache.has(roleId)) {
                        await member.roles.add(role);
                        addedRoles.push(role.name);
                    }
                } else {
                    // Role is not selected but member has it
                    if (member.roles.cache.has(roleId)) {
                        await member.roles.remove(role);
                        removedRoles.push(role.name);
                    }
                }
            } catch (error) {
                console.error(`Error processing role ${roleId}:`, error);
            }
        }

        // Build response message
        let response = "";
        if (addedRoles.length > 0) {
            response += `✅ Added roles: ${addedRoles.join(", ")}\n`;
        }
        if (removedRoles.length > 0) {
            response += `❌ Removed roles: ${removedRoles.join(", ")}\n`;
        }
        if (response === "") {
            response = "No changes were made to your roles.";
        }

        await interaction.editReply({
            embeds: [
                {
                    title: "Roles Updated",
                    description: response,
                    color: 0x2ecc71,
                },
            ],
        });
        return true;
    } catch (error) {
        console.error("Error handling reaction role selection:", error);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
                embeds: [
                    errorEmbed(
                        "Error",
                        "An error occurred while updating your roles.",
                    ),
                ],
                ephemeral: true,
            });
        } else {
            await interaction.editReply({
                embeds: [
                    errorEmbed(
                        "Error",
                        "An error occurred while updating your roles.",
                    ),
                ],
            });
        }
        return true;
    }
}
