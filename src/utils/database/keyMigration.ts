import type pg from 'pg';
import { pgConfig } from '../../config/database/postgres.js';
import { canonicalizeKey } from './keys.js';
import { parseKey } from './keyParser.js';

/**
 * Marker version for the key-canonicalization migration. Bump this only if a new
 * legacy → canonical mapping is added that requires re-scanning existing data.
 */
export const KEY_MIGRATION_VERSION = 1;
const KEY_MIGRATION_MARKER = `__meta:key_migration:v${KEY_MIGRATION_VERSION}`;

async function keyExists(client: pg.PoolClient, canonicalKey: string): Promise<boolean> {
    const parsed = parseKey(canonicalKey);

    if (parsed.type === 'economy') {
        const result = await client.query(
            `SELECT 1 FROM ${pgConfig.tables.economy} WHERE guild_id = $1 AND user_id = $2 LIMIT 1`,
            [parsed.guildId, parsed.userId],
        );
        return result.rows.length > 0;
    }

    if (parsed.type === 'user_level') {
        const result = await client.query(
            `SELECT 1 FROM ${pgConfig.tables.user_levels} WHERE guild_id = $1 AND user_id = $2 LIMIT 1`,
            [parsed.guildId, parsed.userId],
        );
        return result.rows.length > 0;
    }

    if (parsed.type === 'counters') {
        const result = await client.query(
            `SELECT counters FROM ${pgConfig.tables.guilds} WHERE id = $1 AND counters IS NOT NULL AND counters <> '[]'::jsonb LIMIT 1`,
            [parsed.guildId],
        );
        return result.rows.length > 0;
    }

    const tempResult = await client.query(
        `SELECT 1 FROM ${pgConfig.tables.temp_data} WHERE key = $1 LIMIT 1`,
        [canonicalKey],
    );
    return tempResult.rows.length > 0;
}

async function ensureParentRows(
    client: pg.PoolClient,
    guildId: string | null | undefined,
    userId: string | null | undefined,
): Promise<void> {
    if (guildId) {
        await client.query(
            `INSERT INTO ${pgConfig.tables.guilds} (id, created_at)
             VALUES ($1, CURRENT_TIMESTAMP) ON CONFLICT (id) DO NOTHING`,
            [guildId],
        );
    }
    if (userId) {
        await client.query(
            `INSERT INTO ${pgConfig.tables.users} (id, created_at)
             VALUES ($1, CURRENT_TIMESTAMP) ON CONFLICT (id) DO NOTHING`,
            [userId],
        );
    }
}

function resolveTimestampValue(input: unknown, fallback = new Date()): Date {
    if (input instanceof Date && !Number.isNaN(input.getTime())) {
        return input;
    }

    if (typeof input === 'string' && /^[0-9]+$/.test(input)) {
        const timestamp = new Date(Number(input));
        return Number.isNaN(timestamp.getTime()) ? fallback : timestamp;
    }

    if (typeof input === 'number' && Number.isFinite(input)) {
        const timestamp = new Date(input);
        return Number.isNaN(timestamp.getTime()) ? fallback : timestamp;
    }

    const parsedDate = new Date(input as string | number | Date);
    return !Number.isNaN(parsedDate.getTime()) ? parsedDate : fallback;
}

async function migrateEconomyFromTemp(client: pg.PoolClient, legacyKey: string, value: unknown): Promise<void> {
    const parsed = parseKey(canonicalizeKey(legacyKey));
    const payload: Record<string, unknown> | null | undefined = typeof value === 'string' ? JSON.parse(value) : value;
    const wallet = payload?.wallet ?? payload?.balance ?? 0;
    const bank = payload?.bank ?? 0;

    await ensureParentRows(client, parsed.guildId, parsed.userId);
    await client.query(
        `INSERT INTO ${pgConfig.tables.economy} (guild_id, user_id, balance, bank, data, updated_at)
         VALUES ($1, $2, $3, $4, $5::jsonb, CURRENT_TIMESTAMP)
         ON CONFLICT (guild_id, user_id) DO UPDATE SET
           balance = EXCLUDED.balance,
           bank = EXCLUDED.bank,
           data = EXCLUDED.data,
           updated_at = CURRENT_TIMESTAMP`,
        [parsed.guildId, parsed.userId, wallet, bank, JSON.stringify(payload ?? {})],
    );
}

async function migrateUserLevelFromTemp(client: pg.PoolClient, legacyKey: string, value: unknown): Promise<void> {
    const parsed = parseKey(canonicalizeKey(legacyKey));
    const payload: Record<string, unknown> | null | undefined = typeof value === 'string' ? JSON.parse(value) : value;
    const lastMessageValue = payload?.lastMessage ?? payload?.last_message;

    await ensureParentRows(client, parsed.guildId, parsed.userId);
    await client.query(
        `INSERT INTO ${pgConfig.tables.user_levels}
         (guild_id, user_id, xp, level, total_xp, last_message, rank, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
         ON CONFLICT (guild_id, user_id) DO UPDATE SET
           xp = EXCLUDED.xp,
           level = EXCLUDED.level,
           total_xp = EXCLUDED.total_xp,
           last_message = EXCLUDED.last_message,
           rank = EXCLUDED.rank,
           updated_at = CURRENT_TIMESTAMP`,
        [
            parsed.guildId,
            parsed.userId,
            Number(payload?.xp) || 0,
            Number(payload?.level) || 0,
            Number(payload?.totalXp ?? payload?.total_xp) || 0,
            resolveTimestampValue(lastMessageValue),
            Number(payload?.rank) || 0,
        ],
    );
}

async function migrateCountersFromTemp(client: pg.PoolClient, legacyKey: string, value: unknown): Promise<void> {
    const parsed = parseKey(canonicalizeKey(legacyKey));
    const payload: unknown = typeof value === 'string' ? JSON.parse(value) : value;
    const counters = Array.isArray(payload) ? payload : [];

    await ensureParentRows(client, parsed.guildId, null);
    await client.query(
        `INSERT INTO ${pgConfig.tables.guilds} (id, counters, updated_at)
         VALUES ($1, $2::jsonb, CURRENT_TIMESTAMP)
         ON CONFLICT (id) DO UPDATE SET counters = EXCLUDED.counters, updated_at = CURRENT_TIMESTAMP`,
        [parsed.guildId, JSON.stringify(counters)],
    );
}

async function migrateTempKeyRename(client: pg.PoolClient, legacyKey: string, canonicalKey: string): Promise<void> {
    await client.query(
        `INSERT INTO ${pgConfig.tables.temp_data} (key, value, expires_at, created_at)
         SELECT $1, value, expires_at, created_at
         FROM ${pgConfig.tables.temp_data}
         WHERE key = $2
         ON CONFLICT (key) DO NOTHING`,
        [canonicalKey, legacyKey],
    );
    await client.query(`DELETE FROM ${pgConfig.tables.temp_data} WHERE key = $1`, [legacyKey]);
}

async function hasCompletedMarker(client: pg.PoolClient): Promise<boolean> {
    const result = await client.query(
        `SELECT 1 FROM ${pgConfig.tables.temp_data} WHERE key = $1 LIMIT 1`,
        [KEY_MIGRATION_MARKER],
    );
    return result.rows.length > 0;
}

async function writeCompletedMarker(client: pg.PoolClient, summary: KeyMigrationSummary): Promise<void> {
    await client.query(
        `INSERT INTO ${pgConfig.tables.temp_data} (key, value, expires_at, created_at)
         VALUES ($1, $2::jsonb, NULL, CURRENT_TIMESTAMP)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        [KEY_MIGRATION_MARKER, JSON.stringify({ completedAt: new Date().toISOString(), ...summary })],
    );
}

/** Minimal logger surface used by the migration (winston logger or console). */
export interface MigrationLogger {
    info(message: string, ...meta: unknown[]): unknown;
    error(message: string, ...meta: unknown[]): unknown;
}

export interface KeyMigrationOptions {
    pool?: pg.Pool | null;
    dryRun?: boolean;
    force?: boolean;
    logger?: MigrationLogger;
}

export interface KeyMigrationSummary {
    migrated: number;
    skipped: number;
    errors: number;
    alreadyDone?: boolean;
}

/**
 * Migrate legacy database keys to their canonical form.
 *
 * @param {object} options
 * @param {import('pg').Pool} options.pool - Connected pg pool.
 * @param {boolean} [options.dryRun=false] - Log actions without writing.
 * @param {boolean} [options.force=false] - Ignore the completion marker.
 * @param {object} [options.logger=console] - Logger with info/warn/error.
 * @returns {Promise<{migrated:number, skipped:number, errors:number, alreadyDone?:boolean}>}
 */
export async function runKeyMigration(
    { pool, dryRun = false, force = false, logger = console }: KeyMigrationOptions = {},
): Promise<KeyMigrationSummary> {
    if (!pool) {
        throw new Error('runKeyMigration requires a connected pg pool');
    }

    const client = await pool.connect();
    const summary: KeyMigrationSummary = { migrated: 0, skipped: 0, errors: 0 };

    try {
        if (!force && !dryRun && (await hasCompletedMarker(client))) {
            return { ...summary, alreadyDone: true };
        }

        logger.info(`Starting key migration${dryRun ? ' (dry run)' : ''}...`);

        const rows = await client.query<{ key: string; value: unknown }>(
            `SELECT key, value FROM ${pgConfig.tables.temp_data} ORDER BY key`,
        );

        for (const row of rows.rows) {
            const legacyKey = row.key;
            if (legacyKey === KEY_MIGRATION_MARKER) continue;

            const canonicalKey = canonicalizeKey(legacyKey);
            if (legacyKey === canonicalKey) continue;

            try {
                if (await keyExists(client, canonicalKey)) {
                    logger.info(`Skip ${legacyKey} -> ${canonicalKey} (canonical already exists)`);
                    summary.skipped += 1;
                    if (!dryRun) {
                        await client.query(
                            `DELETE FROM ${pgConfig.tables.temp_data} WHERE key = $1`,
                            [legacyKey],
                        );
                    }
                    continue;
                }

                const parsed = parseKey(canonicalKey);
                logger.info(`Migrate ${legacyKey} -> ${canonicalKey} [${parsed.type}]`);

                if (!dryRun) {
                    if (parsed.type === 'economy') {
                        await migrateEconomyFromTemp(client, legacyKey, row.value);
                        await client.query(
                            `DELETE FROM ${pgConfig.tables.temp_data} WHERE key = $1`,
                            [legacyKey],
                        );
                    } else if (parsed.type === 'user_level') {
                        await migrateUserLevelFromTemp(client, legacyKey, row.value);
                        await client.query(
                            `DELETE FROM ${pgConfig.tables.temp_data} WHERE key = $1`,
                            [legacyKey],
                        );
                    } else if (parsed.type === 'counters') {
                        await migrateCountersFromTemp(client, legacyKey, row.value);
                        await client.query(
                            `DELETE FROM ${pgConfig.tables.temp_data} WHERE key = $1`,
                            [legacyKey],
                        );
                    } else {
                        await migrateTempKeyRename(client, legacyKey, canonicalKey);
                    }
                }

                summary.migrated += 1;
            } catch (error) {
                summary.errors += 1;
                logger.error(`Failed to migrate ${legacyKey}:`, error);
            }
        }

        if (!dryRun) {
            await writeCompletedMarker(client, summary);
        }

        logger.info('Key migration complete', summary);
        return summary;
    } finally {
        client.release();
    }
}
