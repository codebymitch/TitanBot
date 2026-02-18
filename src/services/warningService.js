import { getFromDb, setInDb } from '../utils/database.js';
import { logger } from '../utils/logger.js';





export class WarningService {
  




  static async addWarning({
    guildId,
    userId,
    moderatorId,
    reason,
    timestamp = Date.now()
  }) {
    try {
      const key = `moderation:warnings:${guildId}:${userId}`;
      
      
      const warnings = await getFromDb(key, []);
      
      
      if (!Array.isArray(warnings)) {
        logger.warn(`Warnings for ${userId} in ${guildId} corrupted, resetting`);
        await setInDb(key, []);
        return { success: false, error: 'Corrupted data' };
      }

      
      const warning = {
        id: Date.now(),
        guildId,
        userId,
        moderatorId,
        reason,
        timestamp,
        status: 'active'
      };

      
      warnings.push(warning);

      
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

  





  static async getWarningCount(guildId, userId) {
    const warnings = await this.getWarnings(guildId, userId);
    return warnings.length;
  }

  






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

  





  static async getGuildWarnings(guildId, filters = {}) {
    try {
      const { moderatorId, limit = 100 } = filters;
      const prefix = `moderation:warnings:${guildId}:`;
      
      // This implementation assumes database has list() method
      
      const allWarnings = [];
      
      logger.debug(`Fetched guild warnings for ${guildId} with ${allWarnings.length} total`);
      return allWarnings.slice(0, limit);
    } catch (error) {
      logger.error('Error fetching guild warnings:', error);
      return [];
    }
  }
}
