import { getGuildConfig as getGuildConfigDb, setGuildConfig as setGuildConfigDb } from '../utils/database.js';
import { BotConfig } from '../config/bot.js';
import { normalizeGuildConfig } from '../utils/schemas.js';

const GUILD_CONFIG_DEFAULTS = {
    prefix: BotConfig.prefix,
    modRole: null,
    adminRole: null,
    logChannelId: null,
    welcomeChannel: null,
    welcomeMessage: 'Welcome {user} to {server}!',
    autoRole: null,
    dmOnClose: true,
    logIgnore: { users: [], channels: [] },
    logging: {
        enabled: true,
        channelId: null,
        enabledEvents: {}
    }
};

/**
 * Get guild configuration with defaults
 * @param {Object} client - The Discord client
 * @param {string} guildId - The guild ID
 * @returns {Promise<Object>} The guild configuration
 */
export async function getGuildConfig(client, guildId) {
    const config = await getGuildConfigDb(client, guildId);

    return normalizeGuildConfig(config, GUILD_CONFIG_DEFAULTS);
}

/**
 * Set guild configuration
 * @param {Object} client - The Discord client
 * @param {string} guildId - The guild ID
 * @param {Object} config - The configuration to save
 * @returns {Promise<boolean>} Whether the operation was successful
 */
export async function setGuildConfig(client, guildId, config) {
    const normalized = normalizeGuildConfig(config, GUILD_CONFIG_DEFAULTS);
    return await setGuildConfigDb(client, guildId, normalized);
}

/**
 * Update guild configuration
 * @param {Object} client - The Discord client
 * @param {string} guildId - The guild ID
 * @param {Object} updates - The updates to apply
 * @returns {Promise<boolean>} Whether the operation was successful
 */
export async function updateGuildConfig(client, guildId, updates) {
    const currentConfig = await getGuildConfigDb(client, guildId);
    const newConfig = { ...currentConfig, ...updates };
    const normalized = normalizeGuildConfig(newConfig, GUILD_CONFIG_DEFAULTS);
    return await setGuildConfigDb(client, guildId, normalized);
}

/**
 * Get a specific configuration value
 * @param {Object} client - The Discord client
 * @param {string} guildId - The guild ID
 * @param {string} key - The configuration key
 * @param {*} defaultValue - Default value if key doesn't exist
 * @returns {Promise<*>} The configuration value
 */
export async function getConfigValue(client, guildId, key, defaultValue = null) {
    const config = await getGuildConfig(client, guildId);
    return config[key] !== undefined ? config[key] : defaultValue;
}

/**
 * Set a specific configuration value
 * @param {Object} client - The Discord client
 * @param {string} guildId - The guild ID
 * @param {string} key - The configuration key
 * @param {*} value - The value to set
 * @returns {Promise<boolean>} Whether the operation was successful
 */
export async function setConfigValue(client, guildId, key, value) {
    return await updateGuildConfig(client, guildId, { [key]: value });
}


