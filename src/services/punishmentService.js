import { pgDb } from '../utils/postgresDatabase.js';
import { getFromDb, setInDb } from '../utils/database.js';
import { logger } from '../utils/logger.js';

const TABLE = 'moderation_punishments';

/**
 * PunishmentService — persistent record of all moderation actions.
 * Writes to PostgreSQL when available, falls back to key-value store.
 * Used to detect & prevent punishment evasion when users rejoin.
 */
export class PunishmentService {

    /**
     * Record a new punishment.
     * @param {object} opts
     * @param {string} opts.guildId
     * @param {string} opts.userId
     * @param {string} opts.moderatorId
     * @param {'BAN'|'KICK'|'TIMEOUT'|'WARN'} opts.action
     * @param {string}  [opts.reason]
     * @param {number|null} [opts.durationMinutes] — null = no expiry (ban/kick/warn)
     * @param {number|null} [opts.caseId]
     */
    static async record({ guildId, userId, moderatorId, action, reason = 'No reason provided', durationMinutes = null, caseId = null }) {
        const expiresAt = durationMinutes
            ? new Date(Date.now() + durationMinutes * 60 * 1000)
            : null;

        try {
            if (pgDb.isAvailable()) {
                const result = await pgDb.pool.query(
                    `INSERT INTO ${TABLE}
                        (guild_id, user_id, moderator_id, action, reason, duration_minutes, expires_at, active, case_id)
                     VALUES ($1,$2,$3,$4,$5,$6,$7,TRUE,$8)
                     RETURNING id`,
                    [guildId, userId, moderatorId, action, reason, durationMinutes, expiresAt, caseId]
                );
                logger.debug(`Punishment recorded [${action}] for ${userId} in ${guildId} (id=${result.rows[0]?.id})`);
                return { success: true, id: result.rows[0]?.id };
            }
        } catch (err) {
            logger.warn(`PunishmentService.record PG failed, falling back to KV:`, err.message);
        }

        // KV fallback
        const key = `punishments:${guildId}:${userId}`;
        const list = await getFromDb(key, []);
        const entry = {
            id: Date.now(),
            guildId, userId, moderatorId, action, reason,
            durationMinutes,
            expiresAt: expiresAt?.toISOString() ?? null,
            active: true,
            caseId,
            createdAt: new Date().toISOString(),
        };
        list.push(entry);
        if (list.length > 200) list.splice(0, list.length - 200);
        await setInDb(key, list);
        return { success: true, id: entry.id };
    }

    /**
     * Return active (non-expired, non-revoked) punishments for a user.
     */
    static async getActive(guildId, userId) {
        try {
            if (pgDb.isAvailable()) {
                const result = await pgDb.pool.query(
                    `SELECT * FROM ${TABLE}
                     WHERE guild_id = $1
                       AND user_id  = $2
                       AND active   = TRUE
                       AND (expires_at IS NULL OR expires_at > NOW())
                     ORDER BY created_at DESC`,
                    [guildId, userId]
                );
                return result.rows;
            }
        } catch (err) {
            logger.warn('PunishmentService.getActive PG failed:', err.message);
        }

        const key = `punishments:${guildId}:${userId}`;
        const list = await getFromDb(key, []);
        const now = Date.now();
        return list.filter(p =>
            p.active && (!p.expiresAt || new Date(p.expiresAt).getTime() > now)
        );
    }

    /**
     * Return the full punishment history for a user (newest first).
     */
    static async getUserHistory(guildId, userId, limit = 25) {
        try {
            if (pgDb.isAvailable()) {
                const result = await pgDb.pool.query(
                    `SELECT * FROM ${TABLE}
                     WHERE guild_id = $1 AND user_id = $2
                     ORDER BY created_at DESC
                     LIMIT $3`,
                    [guildId, userId, limit]
                );
                return result.rows;
            }
        } catch (err) {
            logger.warn('PunishmentService.getUserHistory PG failed:', err.message);
        }

        const key = `punishments:${guildId}:${userId}`;
        const list = await getFromDb(key, []);
        return [...list]
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
            .slice(0, limit);
    }

    /**
     * Deactivate all active punishments of a given action type for a user.
     * Called on unban / untimeout.
     */
    static async deactivate(guildId, userId, action) {
        try {
            if (pgDb.isAvailable()) {
                await pgDb.pool.query(
                    `UPDATE ${TABLE}
                     SET active = FALSE, updated_at = NOW()
                     WHERE guild_id = $1 AND user_id = $2 AND action = $3 AND active = TRUE`,
                    [guildId, userId, action]
                );
                return true;
            }
        } catch (err) {
            logger.warn('PunishmentService.deactivate PG failed:', err.message);
        }

        // KV fallback
        const key = `punishments:${guildId}:${userId}`;
        const list = await getFromDb(key, []);
        let changed = false;
        for (const p of list) {
            if (p.action === action && p.active) { p.active = false; changed = true; }
        }
        if (changed) await setInDb(key, list);
        return true;
    }

    /**
     * Count total punishments by type for a user.
     */
    static async countByAction(guildId, userId) {
        const history = await this.getUserHistory(guildId, userId, 1000);
        const counts = { BAN: 0, KICK: 0, TIMEOUT: 0, WARN: 0 };
        for (const p of history) {
            if (counts[p.action] !== undefined) counts[p.action]++;
        }
        counts.total = history.length;
        return counts;
    }
}
