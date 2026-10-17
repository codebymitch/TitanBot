// warningService.js

import { db, getFromDb, setInDb, getWarningsKey, getWarningsPrefix } from '../../utils/database.js';
import { logger } from '../../utils/logger.js';
import { createError, ErrorTypes, wrapServiceClassMethods } from '../../utils/errorHandler.js';

/** Stored warning (`guild:{guildId}:warnings:{userId}` holds an array of these). */
export interface Warning {
  id: number;
  guildId: string;
  userId: string;
  moderatorId: string;
  reason: string;
  timestamp: number;
  status: 'active' | 'deleted';
}

export interface GuildWarningFilters {
  moderatorId?: string;
  limit?: number;
}

class WarningService {

  static async addWarning({
    guildId,
    userId,
    moderatorId,
    reason,
    timestamp = Date.now()
  }: {
    guildId: string;
    userId: string;
    moderatorId: string;
    reason: string;
    timestamp?: number;
  }): Promise<{ id: number; totalCount: number }> {
    const key = getWarningsKey(guildId, userId);
    const warnings = await getFromDb<Warning[]>(key, []);

    if (!Array.isArray(warnings)) {
      logger.warn(`Warnings for ${userId} in ${guildId} corrupted, resetting`);
      await setInDb(key, []);
      throw createError(
        'Corrupted warning data',
        ErrorTypes.DATABASE,
        'Die Verwarnungsdaten waren beschädigt und wurden zurückgesetzt. Bitte versuch es erneut.',
        { guildId, userId, service: 'warningService', operation: 'addWarning' }
      );
    }

    const warning: Warning = {
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
      id: warning.id,
      totalCount: warnings.length
    };
  }

  static async getWarnings(guildId: string, userId: string): Promise<Warning[]> {
    const key = getWarningsKey(guildId, userId);
    const warnings = await getFromDb<Warning[]>(key, []);

    return Array.isArray(warnings)
      ? warnings.filter(w => w && w.status !== 'deleted')
      : [];
  }

  static async getWarningCount(guildId: string, userId: string): Promise<number> {
    const warnings = await this.getWarnings(guildId, userId);
    return warnings.length;
  }

  static async removeWarning(guildId: string, userId: string, warningId: number): Promise<{ removed: boolean }> {
    const key = getWarningsKey(guildId, userId);
    const warnings = await getFromDb<Warning[]>(key, []);

    const index = warnings.findIndex(w => w.id === warningId);
    if (index === -1) {
      throw createError(
        'Warning not found',
        ErrorTypes.USER_INPUT,
        'Diese Verwarnung wurde nicht gefunden. Vielleicht wurde sie bereits entfernt.',
        { guildId, userId, warningId, service: 'warningService', operation: 'removeWarning' }
      );
    }

    warnings[index].status = 'deleted';
    await setInDb(key, warnings);

    logger.info(`Warning removed: ${warningId} for ${userId} in ${guildId}`);
    return { removed: true };
  }

  static async clearWarnings(guildId: string, userId: string): Promise<{ count: number }> {
    const key = getWarningsKey(guildId, userId);
    const warnings = await getFromDb<Warning[]>(key, []);
    const count = warnings.length;

    await setInDb(key, []);

    logger.info(`Warnings cleared for ${userId} in ${guildId} (${count} removed)`);
    return { count };
  }

  static async getGuildWarnings(guildId: string, filters: GuildWarningFilters = {}): Promise<Warning[]> {
    const { moderatorId, limit = 100 } = filters;
    const prefix = getWarningsPrefix(guildId);

    const keys = await db.list(prefix);
    const allWarnings: Warning[] = [];

    for (const key of Array.isArray(keys) ? keys : []) {
      const warnings = await getFromDb<Warning[]>(key, []);
      if (!Array.isArray(warnings)) continue;

      for (const warning of warnings) {
        if (!warning || warning.status === 'deleted') continue;
        if (moderatorId && warning.moderatorId !== moderatorId) continue;
        allWarnings.push(warning);
      }
    }

    allWarnings.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    logger.debug(`Fetched guild warnings for ${guildId} with ${allWarnings.length} total`);
    return allWarnings.slice(0, limit);
  }
}

wrapServiceClassMethods(WarningService);

export { WarningService };
