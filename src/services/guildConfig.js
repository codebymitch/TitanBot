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
        enabled: false,
        channelId: null,
        enabledEvents: {}
    }
};







export async function getGuildConfig(client, guildId) {
    const config = await getGuildConfigDb(client, guildId);

    return normalizeGuildConfig(config, GUILD_CONFIG_DEFAULTS);
}








export async function setGuildConfig(client, guildId, config) {
    const normalized = normalizeGuildConfig(config, GUILD_CONFIG_DEFAULTS);
    return await setGuildConfigDb(client, guildId, normalized);
}








export async function updateGuildConfig(client, guildId, updates) {
    const currentConfig = await getGuildConfigDb(client, guildId);
    const newConfig = { ...currentConfig, ...updates };
    const normalized = normalizeGuildConfig(newConfig, GUILD_CONFIG_DEFAULTS);
    return await setGuildConfigDb(client, guildId, normalized);
}









export async function getConfigValue(client, guildId, key, defaultValue = null) {
    const config = await getGuildConfig(client, guildId);
    return config[key] !== undefined ? config[key] : defaultValue;
}









export async function setConfigValue(client, guildId, key, value) {
    return await updateGuildConfig(client, guildId, { [key]: value });
}


