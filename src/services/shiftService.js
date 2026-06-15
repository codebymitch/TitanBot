import { pgDb } from '../utils/postgresDatabase.js';
import { logger } from '../utils/logger.js';

/**
 * Ensures the shifts and shift_config tables exist in the database.
 * Called lazily before any shift operation so the tables are always ready.
 */
async function ensureTables() {
    if (!pgDb.isAvailable()) {
        throw new Error('Database is not available');
    }

    await pgDb.pool.query(`
        CREATE TABLE IF NOT EXISTS shifts (
            id SERIAL PRIMARY KEY,
            user_id VARCHAR(20) NOT NULL,
            guild_id VARCHAR(20) NOT NULL,
            start_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            end_time TIMESTAMP,
            break_time BIGINT NOT NULL DEFAULT 0,
            break_started_at TIMESTAMP,
            on_break BOOLEAN NOT NULL DEFAULT FALSE,
            total_duration BIGINT,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await pgDb.pool.query(`
        CREATE INDEX IF NOT EXISTS idx_shifts_guild_user ON shifts(guild_id, user_id)
    `);

    await pgDb.pool.query(`
        CREATE INDEX IF NOT EXISTS idx_shifts_guild_id ON shifts(guild_id)
    `);

    await pgDb.pool.query(`
        CREATE TABLE IF NOT EXISTS shift_config (
            guild_id VARCHAR(20) PRIMARY KEY,
            shift_role_id VARCHAR(20),
            shift_start_role_id VARCHAR(20),
            shift_break_role_id VARCHAR(20),
            shift_stop_role_id VARCHAR(20),
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Migrate existing tables: add per-action columns if they don't exist yet
    await pgDb.pool.query(`
        ALTER TABLE shift_config
            ADD COLUMN IF NOT EXISTS shift_start_role_id VARCHAR(20),
            ADD COLUMN IF NOT EXISTS shift_break_role_id VARCHAR(20),
            ADD COLUMN IF NOT EXISTS shift_stop_role_id VARCHAR(20)
    `);

    // Drop NOT NULL constraint on shift_role_id for tables created with the old schema
    await pgDb.pool.query(`
        ALTER TABLE shift_config ALTER COLUMN shift_role_id DROP NOT NULL
    `);
}

/**
 * Get the configured shift role ID for a guild (legacy / backward-compat).
 * Returns the first non-null role found across start/break/stop, or the old
 * catch-all shift_role_id, so callers that only need "any configured role"
 * still work without changes.
 * @param {string} guildId
 * @returns {Promise<string|null>}
 */
export async function getShiftRoleId(guildId) {
    await ensureTables();
    const result = await pgDb.pool.query(
        'SELECT shift_role_id, shift_start_role_id, shift_break_role_id, shift_stop_role_id FROM shift_config WHERE guild_id = $1',
        [guildId]
    );
    if (result.rows.length === 0) return null;
    const row = result.rows[0];
    return row.shift_start_role_id ?? row.shift_break_role_id ?? row.shift_stop_role_id ?? row.shift_role_id ?? null;
}

/**
 * Get the role ID allowed to start shifts for a guild.
 * @param {string} guildId
 * @returns {Promise<string|null>}
 */
export async function getShiftStartRoleId(guildId) {
    await ensureTables();
    const result = await pgDb.pool.query(
        'SELECT shift_start_role_id FROM shift_config WHERE guild_id = $1',
        [guildId]
    );
    return result.rows.length > 0 ? result.rows[0].shift_start_role_id : null;
}

/**
 * Get the role ID allowed to use break/resume for a guild.
 * @param {string} guildId
 * @returns {Promise<string|null>}
 */
export async function getShiftBreakRoleId(guildId) {
    await ensureTables();
    const result = await pgDb.pool.query(
        'SELECT shift_break_role_id FROM shift_config WHERE guild_id = $1',
        [guildId]
    );
    return result.rows.length > 0 ? result.rows[0].shift_break_role_id : null;
}

/**
 * Get the role ID allowed to stop shifts for a guild.
 * @param {string} guildId
 * @returns {Promise<string|null>}
 */
export async function getShiftStopRoleId(guildId) {
    await ensureTables();
    const result = await pgDb.pool.query(
        'SELECT shift_stop_role_id FROM shift_config WHERE guild_id = $1',
        [guildId]
    );
    return result.rows.length > 0 ? result.rows[0].shift_stop_role_id : null;
}

/**
 * Set the role that can start shifts for a guild.
 * @param {string} guildId
 * @param {string} roleId
 * @returns {Promise<void>}
 */
export async function setShiftStartRole(guildId, roleId) {
    await ensureTables();
    await pgDb.pool.query(
        `INSERT INTO shift_config (guild_id, shift_start_role_id, updated_at)
         VALUES ($1, $2, CURRENT_TIMESTAMP)
         ON CONFLICT (guild_id)
         DO UPDATE SET shift_start_role_id = $2, updated_at = CURRENT_TIMESTAMP`,
        [guildId, roleId]
    );
}

/**
 * Set the role that can use break/resume for a guild.
 * @param {string} guildId
 * @param {string} roleId
 * @returns {Promise<void>}
 */
export async function setShiftBreakRole(guildId, roleId) {
    await ensureTables();
    await pgDb.pool.query(
        `INSERT INTO shift_config (guild_id, shift_break_role_id, updated_at)
         VALUES ($1, $2, CURRENT_TIMESTAMP)
         ON CONFLICT (guild_id)
         DO UPDATE SET shift_break_role_id = $2, updated_at = CURRENT_TIMESTAMP`,
        [guildId, roleId]
    );
}

/**
 * Set the role that can stop shifts for a guild.
 * @param {string} guildId
 * @param {string} roleId
 * @returns {Promise<void>}
 */
export async function setShiftStopRole(guildId, roleId) {
    await ensureTables();
    await pgDb.pool.query(
        `INSERT INTO shift_config (guild_id, shift_stop_role_id, updated_at)
         VALUES ($1, $2, CURRENT_TIMESTAMP)
         ON CONFLICT (guild_id)
         DO UPDATE SET shift_stop_role_id = $2, updated_at = CURRENT_TIMESTAMP`,
        [guildId, roleId]
    );
}

/**
 * Get the active (open) shift for a user in a guild.
 * @param {string} userId
 * @param {string} guildId
 * @returns {Promise<Object|null>}
 */
export async function getActiveShift(userId, guildId) {
    await ensureTables();
    const result = await pgDb.pool.query(
        `SELECT * FROM shifts
         WHERE user_id = $1 AND guild_id = $2 AND end_time IS NULL
         ORDER BY start_time DESC
         LIMIT 1`,
        [userId, guildId]
    );
    return result.rows.length > 0 ? result.rows[0] : null;
}

/**
 * Start a new shift for a user.
 * @param {string} userId
 * @param {string} guildId
 * @returns {Promise<Object>} The created shift row
 */
export async function startShift(userId, guildId) {
    await ensureTables();
    const result = await pgDb.pool.query(
        `INSERT INTO shifts (user_id, guild_id, start_time)
         VALUES ($1, $2, CURRENT_TIMESTAMP)
         RETURNING *`,
        [userId, guildId]
    );
    return result.rows[0];
}

/**
 * Stop an active shift, calculating total duration minus break time.
 * @param {number} shiftId
 * @returns {Promise<Object>} The updated shift row
 */
export async function stopShift(shiftId) {
    await ensureTables();

    // If currently on break, close the break first
    const shiftResult = await pgDb.pool.query(
        'SELECT * FROM shifts WHERE id = $1',
        [shiftId]
    );
    const shift = shiftResult.rows[0];

    let extraBreakMs = 0;
    if (shift.on_break && shift.break_started_at) {
        extraBreakMs = Math.floor(Date.now() - new Date(shift.break_started_at).getTime());
    }

    const totalBreakMs = Math.floor(Number(shift.break_time) + extraBreakMs);

    const result = await pgDb.pool.query(
        `UPDATE shifts
         SET end_time = CURRENT_TIMESTAMP,
             on_break = FALSE,
             break_started_at = NULL,
             break_time = $2::BIGINT,
             total_duration = (EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - start_time)) * 1000)::BIGINT - $2::BIGINT
         WHERE id = $1
         RETURNING *`,
        [shiftId, totalBreakMs]
    );
    return result.rows[0];
}

/**
 * Toggle break status on an active shift.
 * @param {number} shiftId
 * @returns {Promise<{shift: Object, nowOnBreak: boolean}>}
 */
export async function toggleBreak(shiftId) {
    await ensureTables();

    const shiftResult = await pgDb.pool.query(
        'SELECT * FROM shifts WHERE id = $1',
        [shiftId]
    );
    const shift = shiftResult.rows[0];

    let updatedShift;

    if (shift.on_break) {
        // Ending break — accumulate break duration
        const breakDurationMs = Date.now() - new Date(shift.break_started_at).getTime();
        const newBreakTime = Number(shift.break_time) + breakDurationMs;

        const result = await pgDb.pool.query(
            `UPDATE shifts
             SET on_break = FALSE,
                 break_started_at = NULL,
                 break_time = $2
             WHERE id = $1
             RETURNING *`,
            [shiftId, newBreakTime]
        );
        updatedShift = result.rows[0];
        return { shift: updatedShift, nowOnBreak: false };
    } else {
        // Starting break
        const result = await pgDb.pool.query(
            `UPDATE shifts
             SET on_break = TRUE,
                 break_started_at = CURRENT_TIMESTAMP
             WHERE id = $1
             RETURNING *`,
            [shiftId]
        );
        updatedShift = result.rows[0];
        return { shift: updatedShift, nowOnBreak: true };
    }
}

/**
 * Delete all shift records for users who have a specific role in a guild.
 * Since we can't query Discord roles from the DB, we accept a list of member IDs.
 * @param {string} guildId
 * @param {string[]} userIds - Array of user IDs to wipe shifts for
 * @returns {Promise<number>} Number of deleted records
 */
export async function wipeShiftsByUserIds(guildId, userIds) {
    await ensureTables();

    if (!userIds || userIds.length === 0) {
        return 0;
    }

    // Build parameterized query for the user ID list
    const placeholders = userIds.map((_, i) => `$${i + 2}`).join(', ');
    const result = await pgDb.pool.query(
        `DELETE FROM shifts
         WHERE guild_id = $1 AND user_id IN (${placeholders})`,
        [guildId, ...userIds]
    );
    return result.rowCount;
}

/**
 * Format a duration in milliseconds to a human-readable string.
 * e.g. 9135000 → "2h 32m 15s"
 * @param {number} ms
 * @returns {string}
 */
export function formatDuration(ms) {
    if (!ms || ms <= 0) return '0s';

    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const parts = [];
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);

    return parts.join(' ');
}
