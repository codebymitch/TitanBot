// guildConfig.js — the only module that should read/write guild configuration.

import { GUILD_CONFIG_DEFAULTS } from '../../config/guild/guildConfigDefaults.js';
import { readGuildConfig, writeGuildConfig } from '../../utils/database/guildConfigStorage.js';
import { normalizeGuildConfig, validateGuildConfigOrThrow } from '../../utils/schemas.js';
import type { GuildConfigContext } from '../../utils/database/guildConfigStorage.js';
import { createError, ErrorTypes, wrapServiceBoundary } from '../../utils/errorHandler.js';
import type { GuildConfig, NexoClient } from '../../types/index.js';

export { GUILD_CONFIG_DEFAULTS };

export const getGuildConfig = wrapServiceBoundary(async function getGuildConfig(client: NexoClient, guildId: string, context: GuildConfigContext = {}): Promise<GuildConfig> {
    const config = await readGuildConfig(client, guildId, context);
    return normalizeGuildConfig(config, GUILD_CONFIG_DEFAULTS);
}, {
    service: 'guildConfigService',
    operation: 'getGuildConfig',
    message: 'Failed to fetch guild configuration',
    userMessage: 'Die Server-Konfiguration konnte nicht geladen werden. Bitte versuch es erneut.',
});

export const setGuildConfig = wrapServiceBoundary(async function setGuildConfig(client: NexoClient, guildId: string, config: unknown, context: GuildConfigContext = {}): Promise<GuildConfig> {
    const normalized = normalizeGuildConfig(config, GUILD_CONFIG_DEFAULTS);
    return await writeGuildConfig(client, guildId, normalized, context);
}, {
    service: 'guildConfigService',
    operation: 'setGuildConfig',
    message: 'Failed to save guild configuration',
    userMessage: 'Die Server-Konfiguration konnte nicht gespeichert werden. Bitte versuch es erneut.',
});

export const updateGuildConfig = wrapServiceBoundary(async function updateGuildConfig(client: NexoClient, guildId: string, updates: Record<string, unknown>, context: GuildConfigContext = {}): Promise<GuildConfig> {
    const currentConfig = await readGuildConfig(client, guildId, context);
    const merged = { ...currentConfig, ...updates };
    const normalized = normalizeGuildConfig(merged, GUILD_CONFIG_DEFAULTS);
    return await writeGuildConfig(client, guildId, normalized, context);
}, {
    service: 'guildConfigService',
    operation: 'updateGuildConfig',
    message: 'Failed to update guild configuration',
    userMessage: 'Die Server-Konfiguration konnte nicht aktualisiert werden. Bitte versuch es erneut.',
});

export const getConfigValue = wrapServiceBoundary(async function getConfigValue(client: NexoClient, guildId: string, key: string, defaultValue: unknown = null, context: GuildConfigContext = {}): Promise<unknown> {
    const config = await getGuildConfig(client, guildId, context);
    return config[key] !== undefined ? config[key] : defaultValue;
}, {
    service: 'guildConfigService',
    operation: 'getConfigValue',
    message: 'Failed to read guild configuration value',
    userMessage: 'Eine Server-Einstellung konnte nicht gelesen werden. Bitte versuch es erneut.',
});

export const setConfigValue = wrapServiceBoundary(async function setConfigValue(client: NexoClient, guildId: string, key: string, value: unknown, context: GuildConfigContext = {}): Promise<GuildConfig> {
    return await updateGuildConfig(client, guildId, { [key]: value }, context);
}, {
    service: 'guildConfigService',
    operation: 'setConfigValue',
    message: 'Failed to update guild configuration value',
    userMessage: 'Eine Server-Einstellung konnte nicht aktualisiert werden. Bitte versuch es erneut.',
});

/**
 * Merge partial updates into a nested config object (e.g. verification, logging).
 */
export const patchGuildConfig = wrapServiceBoundary(async function patchGuildConfig(client: NexoClient, guildId: string, patch: Record<string, unknown>, context: GuildConfigContext = {}): Promise<GuildConfig> {
    if (!patch || typeof patch !== 'object') {
        throw createError(
            'Invalid guild config patch',
            ErrorTypes.VALIDATION,
            'Ungültige Konfigurationsänderung.',
            { guildId, ...context },
        );
    }

    const currentConfig = await readGuildConfig(client, guildId, context);
    const merged = deepMergeGuildConfig(currentConfig, patch);
    const normalized = normalizeGuildConfig(merged, GUILD_CONFIG_DEFAULTS);
    validateGuildConfigOrThrow(normalized, { guildId, ...context });
    return await writeGuildConfig(client, guildId, normalized, context);
}, {
    service: 'guildConfigService',
    operation: 'patchGuildConfig',
    message: 'Failed to patch guild configuration',
    userMessage: 'Die Server-Konfiguration konnte nicht aktualisiert werden. Bitte versuch es erneut.',
});

function deepMergeGuildConfig(base: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = { ...base };

    for (const [key, value] of Object.entries(patch)) {
        if (
            value &&
            typeof value === 'object' &&
            !Array.isArray(value) &&
            base[key] &&
            typeof base[key] === 'object' &&
            !Array.isArray(base[key])
        ) {
            result[key] = { ...(base[key] as Record<string, unknown>), ...value };
        } else {
            result[key] = value;
        }
    }

    return result;
}
