// streakService.js
//
// Individual (per-user) streaks. Each member in a guild has their own streak
// that counts consecutive UTC calendar days they were active. A streak
// increments by at most one per day; if a full day passes without any activity,
// the current run resets to 0 (the best/longest run is kept).

import { logger } from '../utils/logger.js';
import { createError, ErrorTypes } from '../utils/errorHandler.js';
import { wrapServiceClassMethods } from '../utils/serviceErrorBoundary.js';
import { validateDiscordId } from '../utils/validation.js';

const STREAK_KEY_PREFIX = 'guild:';
const DAY_MS = 24 * 60 * 60 * 1000;

class StreakService {
  static MAX_LEADERBOARD_SIZE = 25;

  static buildPrefix(guildId) {
    return `${STREAK_KEY_PREFIX}${guildId}:streakuser:`;
  }

  static buildStreakKey(guildId, userId) {
    return `${StreakService.buildPrefix(guildId)}${String(userId)}`;
  }

  static parseUserIdFromKey(key, guildId) {
    const prefix = StreakService.buildPrefix(guildId);
    if (typeof key !== 'string' || !key.startsWith(prefix)) {
      return null;
    }
    const userId = key.slice(prefix.length);
    return userId || null;
  }

  /** UTC calendar day as YYYY-MM-DD, or null for an invalid timestamp. */
  static toDayKey(timestamp) {
    const value = Number(timestamp);
    if (!Number.isFinite(value) || value <= 0) {
      return null;
    }
    return new Date(value).toISOString().slice(0, 10);
  }

  static daysBetween(dayA, dayB) {
    if (!dayA || !dayB) {
      return Infinity;
    }

    const start = Date.parse(`${dayA}T00:00:00Z`);
    const end = Date.parse(`${dayB}T00:00:00Z`);
    if (!Number.isFinite(start) || !Number.isFinite(end)) {
      return Infinity;
    }

    return Math.round((end - start) / DAY_MS);
  }

  static assertUser(guildId, userId, context = {}) {
    const validGuildId = validateDiscordId(guildId, 'guildId');
    const validUserId = validateDiscordId(String(userId), 'userId');

    if (!validGuildId || !validUserId) {
      throw createError(
        'Invalid streak identifiers',
        ErrorTypes.VALIDATION,
        'A valid guild and user are required to track a streak.',
        { guildId, userId, ...context }
      );
    }

    return { guildId: validGuildId, userId: validUserId };
  }

  static normalizeStreak(raw, guildId, userId) {
    const base = raw && typeof raw === 'object' ? raw : {};
    const asPositiveInt = (value) => (Number.isFinite(value) && value > 0 ? Math.floor(value) : 0);

    return {
      guildId: String(guildId),
      userId: String(userId),
      count: asPositiveInt(base.count),
      best: asPositiveInt(base.best),
      totalDays: asPositiveInt(base.totalDays),
      lastDay: typeof base.lastDay === 'string' ? base.lastDay : null,
      createdAt: Number(base.createdAt) || null,
      updatedAt: Number(base.updatedAt) || null,
    };
  }

  /** A streak is active while the last active day is today or yesterday. */
  static isActive(streak, referenceTime = Date.now()) {
    if (!streak?.lastDay) {
      return false;
    }

    const today = StreakService.toDayKey(referenceTime);
    return StreakService.daysBetween(streak.lastDay, today) <= 1;
  }

  static withStatus(streak, referenceTime = Date.now()) {
    const active = StreakService.isActive(streak, referenceTime);
    return {
      ...streak,
      active,
      currentCount: active ? streak.count : 0,
      lastDayAt: streak.lastDay ? Date.parse(`${streak.lastDay}T00:00:00Z`) : null,
    };
  }

  static async getUserStreak(client, guildId, userId) {
    const ids = StreakService.assertUser(guildId, userId, { operation: 'getUserStreak' });

    const raw = await client.db.get(
      StreakService.buildStreakKey(ids.guildId, ids.userId),
      null
    );

    if (!raw) {
      return null;
    }

    return StreakService.withStatus(StreakService.normalizeStreak(raw, ids.guildId, ids.userId));
  }

  /**
   * Record activity for a user. The streak increments at most once per UTC day;
   * missing a full day resets the current run to 1 (best is preserved).
   */
  static async recordActivity(client, guildId, userId, options = {}) {
    const ids = StreakService.assertUser(guildId, userId, { operation: 'recordActivity' });
    const timestamp = Number(options.timestamp) > 0 ? Number(options.timestamp) : Date.now();
    const day = StreakService.toDayKey(timestamp);
    const key = StreakService.buildStreakKey(ids.guildId, ids.userId);

    const raw = await client.db.get(key, null);
    const streak = StreakService.normalizeStreak(raw, ids.guildId, ids.userId);

    if (!streak.createdAt) {
      streak.createdAt = timestamp;
    }

    let incremented = false;

    if (!streak.lastDay) {
      // First ever activity.
      streak.count = 1;
      streak.best = 1;
      streak.totalDays = 1;
      streak.lastDay = day;
      incremented = true;
    } else if (streak.lastDay === day) {
      // Already counted today — nothing changes.
      incremented = false;
    } else if (StreakService.daysBetween(streak.lastDay, day) === 1) {
      // Consecutive day — advance.
      streak.count += 1;
      streak.lastDay = day;
      streak.totalDays += 1;
      if (streak.count > streak.best) {
        streak.best = streak.count;
      }
      incremented = true;
    } else {
      // Missed at least one full day — reset the run, keep best.
      streak.count = 1;
      streak.lastDay = day;
      streak.totalDays += 1;
      if (streak.count > streak.best) {
        streak.best = streak.count;
      }
      incremented = true;
    }

    streak.updatedAt = timestamp;

    await client.db.set(key, streak);

    if (incremented) {
      logger.info('[STREAK] Streak updated', {
        guildId: ids.guildId,
        userId: ids.userId,
        count: streak.count,
        best: streak.best,
        day,
      });
    }

    return {
      recorded: true,
      streak: StreakService.withStatus(streak, timestamp),
      incremented,
      day,
    };
  }

  static async getGuildLeaderboard(client, guildId, options = {}) {
    const validGuildId = validateDiscordId(guildId, 'guildId');
    if (!validGuildId) {
      throw createError(
        'Invalid guild id',
        ErrorTypes.VALIDATION,
        'A valid guild is required.',
        { guildId, operation: 'getGuildLeaderboard' }
      );
    }

    const limit = Math.min(
      Math.max(Number(options.limit) || 10, 1),
      StreakService.MAX_LEADERBOARD_SIZE
    );

    const keys = await client.db.list(StreakService.buildPrefix(validGuildId));
    const entries = [];

    for (const key of keys) {
      const userId = StreakService.parseUserIdFromKey(key, validGuildId);
      if (!userId) {
        continue;
      }

      const raw = await client.db.get(key, null);
      if (!raw) {
        continue;
      }

      const streak = StreakService.withStatus(StreakService.normalizeStreak(raw, validGuildId, userId));
      if (streak.currentCount <= 0) {
        continue;
      }
      entries.push(streak);
    }

    entries.sort((a, b) => b.currentCount - a.currentCount || b.best - a.best);
    return entries.slice(0, limit);
  }
}

wrapServiceClassMethods(StreakService, (methodName) => ({
  service: 'StreakService',
  operation: methodName,
  message: `Streak service operation failed: ${methodName}`,
  userMessage: 'A streak operation failed. Please try again in a moment.',
}));

export default StreakService;
