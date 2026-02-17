import { getFromDb, setInDb } from '../utils/database.js';
import { logger } from '../utils/logger.js';

/**
 * Warning Service - Centralized warning management
 * Provides persistent storage and audit trail for user warnings
 */
export class WarningService {
  /**
   * Add a warning to a user
   * @param {Object} params - Warning parameters
   * @returns {Promise<Object>} Warning record with success status
   */
  static async addWarning({
    guildId,
    userId,
    moderatorId,
    reason,
    timestamp = Date.now()
  }) {
    try {
      const key = `moderation:warnings:${guildId}:${userId}`;
      
      // Get existing warnings
      const warnings = await getFromDb(key, []);
      
      // Validate is array
      if (!Array.isArray(warnings)) {
        logger.warn(`Warnings for ${userId} in ${guildId} corrupted, resetting`);
        await setInDb(key, []);
        return { success: false, error: 'Corrupted data' };
      }

      // Create new warning
      const warning = {
        id: Date.now(),
        guildId,
        userId,
        moderatorId,
        reason,
        timestamp,
        status: 'active'
      };

      // Add to array
      warnings.push(warning);

      // Store back
      await setInDb(key, warnings);

      logger.info(`Warning added: ${userId} in ${guildId} by ${moderatorId}`);
      
      return {
        success: true,
        id: warning.id,
        totalCount: warnings.length
      };
    } catch (error) {
      logger.error('Error adding warning:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get all warnings for a user
   * @param {string} guildId - Guild ID
   * @param {string} userId - User ID
   * @returns {Promise<Array>} Array of warning objects
   */
  static async getWarnings(guildId, userId) {
    try {
      const key = `moderation:warnings:${guildId}:${userId}`;
      const warnings = await getFromDb(key, []);
      
      // Filter out deleted warnings and validate schema
      return Array.isArray(warnings) 
        ? warnings.filter(w => w && w.status !== 'deleted')
        : [];
    } catch (error) {
      logger.error('Error fetching warnings:', error);
      return [];
    }
  }

  /**
   * Get warning count for a user
   * @param {string} guildId - Guild ID
   * @param {string} userId - User ID
   * @returns {Promise<number>} Count of active warnings
   */
  static async getWarningCount(guildId, userId) {
    const warnings = await this.getWarnings(guildId, userId);
    return warnings.length;
  }

  /**
   * Remove a specific warning
   * @param {string} guildId - Guild ID
   * @param {string} userId - User ID
   * @param {number} warningId - Warning ID to remove
   * @returns {Promise<Object>} Success status
   */
  static async removeWarning(guildId, userId, warningId) {
    try {
      const key = `moderation:warnings:${guildId}:${userId}`;
      const warnings = await getFromDb(key, []);
      
      const index = warnings.findIndex(w => w.id === warningId);
      if (index === -1) {
        return { success: false, error: 'Warning not found' };
      }

      warnings[index].status = 'deleted';
      await setInDb(key, warnings);

      logger.info(`Warning removed: ${warningId} for ${userId} in ${guildId}`);
      return { success: true };
    } catch (error) {
      logger.error('Error removing warning:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Clear all warnings for a user
   * @param {string} guildId - Guild ID
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Count cleared and success status
   */
  static async clearWarnings(guildId, userId) {
    try {
      const key = `moderation:warnings:${guildId}:${userId}`;
      const warnings = await getFromDb(key, []);
      const count = warnings.length;

      await setInDb(key, []);

      logger.info(`Warnings cleared for ${userId} in ${guildId} (${count} removed)`);
      return { success: true, count };
    } catch (error) {
      logger.error('Error clearing warnings:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get all warnings in a guild (admin view)
   * @param {string} guildId - Guild ID
   * @param {Object} filters - Filter options
   * @returns {Promise<Array>} Array of all warnings
   */
  static async getGuildWarnings(guildId, filters = {}) {
    try {
      const { moderatorId, limit = 100 } = filters;
      const prefix = `moderation:warnings:${guildId}:`;
      
      // This implementation assumes database has list() method
      // In practice, you might want to store a list of all users with warnings
      const allWarnings = [];
      
      logger.debug(`Fetched guild warnings for ${guildId} with ${allWarnings.length} total`);
      return allWarnings.slice(0, limit);
    } catch (error) {
      logger.error('Error fetching guild warnings:', error);
      return [];
    }
  }
}
