import { logger } from '../logger.js';
import type { GuildConfig, NexoClient } from '../../types/index.js';
import { GUILD_CONFIG_DEFAULTS } from '../../config/guild/guildConfigDefaults.js';
import { normalizeGuildConfig, validateGuildConfigOrThrow } from '../schemas.js';
import { createError, ErrorTypes } from '../errorHandler.js';
import { getGuildConfigKey } from './keys.js';

/** Optional tracing context passed through to logs and errors. */
export interface GuildConfigContext {
    traceId?: string | null;
    userId?: string | null;
    command?: string | null;
    [key: string]: unknown;
}

/** Legacy Replit DB envelope `{ ok, value }`. */
interface ReplitEnvelope<T> {
    ok?: unknown;
    value?: T;
}

/** Unwraps legacy `{ ok, value }` envelopes; T is the caller's stored payload type. */
export function unwrapReplitData<T>(data: T): T {
    if (
        typeof data === 'object' &&
        data !== null &&
        (data as ReplitEnvelope<T>).ok !== undefined &&
        (data as ReplitEnvelope<T>).value !== undefined
    ) {
        return unwrapReplitData((data as ReplitEnvelope<T>).value as T);
    }
    return data;
}

/**
 * Low-level guild config read. Returns normalized config with defaults;
 * never throws — callers use the guild config service for typed errors.
 */
export async function readGuildConfig(
    client: NexoClient,
    guildId: string,
    context: GuildConfigContext = {},
): Promise<GuildConfig> {
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
export async function writeGuildConfig(
    client: NexoClient,
    guildId: string,
    config: unknown,
    context: GuildConfigContext = {},
): Promise<GuildConfig> {
    if (!client?.db || typeof client.db.set !== 'function') {
        throw createError(
            'Database client unavailable for guild config write',
            ErrorTypes.DATABASE,
            'Die Server-Konfiguration konnte nicht gespeichert werden. Die Datenbank ist nicht erreichbar.',
            { guildId, ...context },
        );
    }

    const validated = validateGuildConfigOrThrow(config, { guildId, ...context });
    const saved = await client.db.set(getGuildConfigKey(guildId), validated);

    if (!saved) {
        throw createError(
            'Guild config write rejected by database layer',
            ErrorTypes.DATABASE,
            'Die Server-Konfiguration konnte nicht gespeichert werden. Bitte versuch es erneut.',
            { guildId, ...context },
        );
    }

    return validated;
}
