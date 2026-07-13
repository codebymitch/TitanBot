import { logger } from '../logger.js';
import { GUILD_CONFIG_DEFAULTS } from '../../config/guild/guildConfigDefaults.js';
import { normalizeGuildConfig, validateGuildConfigOrThrow } from '../schemas.js';
import { createError, ErrorTypes } from '../errorHandler.js';
import { getGuildConfigKey } from './keys.js';

export function unwrapReplitData(data) {
    if (
        typeof data === 'object' &&
        data !== null &&
        data.ok !== undefined &&
        data.value !== undefined
    ) {
        return unwrapReplitData(data.value);
    }
    return data;
}

/**
 * Low-level guild config read. Returns normalized config with defaults;
 * never throws — callers use the guild config service for typed errors.
 */
export async function readGuildConfig(client, guildId, context = {}) {
    try {
        if (!client?.db || typeof client.db.get !== 'function') {
            logger.warn(`Database unavailable for readGuildConfig in guild ${guildId}`);
            return normalizeGuildConfig({}, GUILD_CONFIG_DEFAULTS);
        }

        if (typeof client.db.isAvailable === 'function' && !client.db.isAvailable()) {
            logger.warn(`PostgreSQL unavailable for readGuildConfig in guild ${guildId}`, {
                traceId: context.traceId,
                guildId,
            });
            return normalizeGuildConfig({}, GUILD_CONFIG_DEFAULTS);
        }

        const rawConfig = await client.db.get(getGuildConfigKey(guildId), null);

        if (rawConfig === null) {
            return normalizeGuildConfig({}, GUILD_CONFIG_DEFAULTS);
        }

        const cleanedConfig = unwrapReplitData(rawConfig);
        return normalizeGuildConfig(cleanedConfig, GUILD_CONFIG_DEFAULTS);
    } catch (error) {
        logger.error(`Error fetching config for guild ${guildId}`, {
            error,
            traceId: context.traceId,
            guildId,
            userId: context.userId,
            command: context.command,
        });
        return normalizeGuildConfig({}, GUILD_CONFIG_DEFAULTS);
    }
}

/**
 * Low-level guild config write. Validates payload and throws on failure.
 */
export async function writeGuildConfig(client, guildId, config, context = {}) {
    if (!client?.db || typeof client.db.set !== 'function') {
        throw createError(
            'Database client unavailable for guild config write',
            ErrorTypes.DATABASE,
            'Failed to save server configuration. The database is unavailable.',
            { guildId, ...context },
        );
    }

    const validated = validateGuildConfigOrThrow(config, { guildId, ...context });
    const saved = await client.db.set(getGuildConfigKey(guildId), validated);

    if (!saved) {
        throw createError(
            'Guild config write rejected by database layer',
            ErrorTypes.DATABASE,
            'Failed to save server configuration. Please try again.',
            { guildId, ...context },
        );
    }

    return validated;
}
