import { logger } from '../utils/logger.js';
import { getClient } from '../utils/database.js';

/**
 * Service for managing punishment records (ban, kick, mute, warn, timeout, etc.)
 * Helps prevent punishment evading by maintaining detailed records
 */
export class PunishmentService {
  /**
   * Record a punishment action
   */
  static async recordPunishment({
    guildId,
    userId,
    moderatorId,
    punishmentType,
    reason,
    durationMinutes = null,
    expiresAt = null,
  }) {
    try {
      const client = await getClient();
      
      const result = await client.query(
        `INSERT INTO punishment_records 
         (guild_id, user_id, moderator_id, punishment_type, reason, duration_minutes, expires_at, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'active')
         RETURNING id, created_at`,
        [guildId, userId, moderatorId, punishmentType, reason, durationMinutes, expiresAt]
      );

      logger.info(`Punishment recorded: ${punishmentType} for ${userId}`, {
        guildId,
        userId,
        moderatorId,
        punishmentType,
        durationMinutes
      });

      return {
        success: true,
        punishmentId: result.rows[0].id,
        recordedAt: result.rows[0].created_at
      };
    } catch (error) {
      logger.error('Error recording punishment:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get all active punishments for a user
   */
  static async getUserPunishments(guildId, userId, punishmentType = null) {
    try {
      const client = await getClient();
      
      let query = `
        SELECT * FROM punishment_records
        WHERE guild_id = $1 AND user_id = $2 AND status = 'active'
      `;
      const params = [guildId, userId];

      if (punishmentType) {
        query += ` AND punishment_type = $3`;
        params.push(punishmentType);
      }

      query += ` ORDER BY created_at DESC`;

      const result = await client.query(query, params);
      return result.rows || [];
    } catch (error) {
      logger.error('Error fetching user punishments:', error);
      return [];
    }
  }

  /**
   * Get recent punishments in a guild
   */
  static async getRecentPunishments(guildId, limit = 10) {
    try {
      const client = await getClient();
      
      const result = await client.query(
        `SELECT * FROM punishment_records
         WHERE guild_id = $1 AND status = 'active'
         ORDER BY created_at DESC
         LIMIT $2`,
        [guildId, limit]
      );

      return result.rows || [];
    } catch (error) {
      logger.error('Error fetching recent punishments:', error);
      return [];
    }
  }

  /**
   * Check if user has recent punishments to prevent evading
   */
  static async hasRecentPunishment(guildId, userId, hoursBack = 24) {
    try {
      const client = await getClient();
      
      const result = await client.query(
        `SELECT COUNT(*) as count FROM punishment_records
         WHERE guild_id = $1 AND user_id = $2 AND status = 'active'
         AND created_at > NOW() - INTERVAL '${hoursBack} hours'`,
        [guildId, userId]
      );

      return result.rows[0].count > 0;
    } catch (error) {
      logger.error('Error checking recent punishments:', error);
      return false;
    }
  }

  /**
   * Update punishment status (e.g., expired, appealed)
   */
  static async updatePunishmentStatus(punishmentId, newStatus, reason = null) {
    try {
      const client = await getClient();
      
      await client.query(
        `UPDATE punishment_records
         SET status = $1, appeal_status = $2, updated_at = NOW()
         WHERE id = $3`,
        [newStatus, reason, punishmentId]
      );

      logger.info(`Punishment ${punishmentId} status updated to ${newStatus}`);
      return { success: true };
    } catch (error) {
      logger.error('Error updating punishment status:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get punishment statistics for a user
   */
  static async getPunishmentStats(guildId, userId) {
    try {
      const client = await getClient();
      
      const result = await client.query(
        `SELECT 
          punishment_type,
          COUNT(*) as count,
          MAX(created_at) as last_occurrence
         FROM punishment_records
         WHERE guild_id = $1 AND user_id = $2 AND status = 'active'
         GROUP BY punishment_type
         ORDER BY count DESC`,
        [guildId, userId]
      );

      return result.rows || [];
    } catch (error) {
      logger.error('Error fetching punishment stats:', error);
      return [];
    }
  }
}
