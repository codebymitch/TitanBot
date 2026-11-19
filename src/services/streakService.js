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
import { createEmbed } from '../utils/embeds.js';
import { getGuildConfig } from './config/guildConfig.js';

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
      alreadyOnDay: typeof base.alreadyOnDay === 'string' ? base.alreadyOnDay : null,
      breakNotified: base.breakNotified === true,
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
    let alreadyOn = false;

    if (!streak.lastDay) {
      // First ever activity.
      streak.count = 1;
      streak.best = 1;
      streak.totalDays = 1;
      streak.lastDay = day;
      incremented = true;
    } else if (streak.lastDay === day) {
      // Already counted today — nudge the user once per day.
      incremented = false;
      if (streak.alreadyOnDay !== day) {
        streak.alreadyOnDay = day;
        alreadyOn = true;
      }
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

    // A new day's activity resets the "already on" reminder.
    if (incremented) {
      streak.alreadyOnDay = null;
    }

    streak.breakNotified = false;
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
      alreadyOn,
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

  /**
   * Find the dedicated streak channel in a guild: the first text-based channel
   * whose name contains "streak" (case-insensitive). Returns null if none.
   */
  static findStreakChannel(guild) {
    if (!guild?.channels?.cache) return null;
    return guild.channels.cache.find((ch) => {
      if (!ch.isTextBased() || ch.isVoiceBased()) return false;
      return typeof ch.name === 'string' && ch.name.toLowerCase().includes('streak');
    }) || null;
  }

  /**
   * Scan every guild for streaks that broke overnight (user had no activity
   * yesterday). The current run is reset to 0 and a notification is posted in
   * the guild's dedicated streak channel once.
   */
  static async checkBrokenStreaks(client) {
    if (!client?.guilds?.cache) return;

    const today = StreakService.toDayKey(Date.now());

    for (const guild of client.guilds.cache.values()) {
      let guildConfig;
      try {
        guildConfig = await getGuildConfig(client, guild.id);
      } catch (error) {
        logger.warn(`[STREAK] Failed to load config for guild ${guild.id}:`, error.message);
        continue;
      }

      // Streaks are opt-in: skip guilds where the feature is disabled.
      if (guildConfig?.streak?.enabled !== true) {
        continue;
      }

      let keys;
      try {
        keys = await client.db.list(StreakService.buildPrefix(guild.id));
      } catch (error) {
        logger.warn(`[STREAK] Failed to list streak keys for guild ${guild.id}:`, error.message);
        continue;
      }

      // Prefer the configured streak channel; fall back to name-based detection.
      const configuredChannelId = guildConfig.streak.channelId;
      const streakChannel = configuredChannelId
        ? guild.channels.cache.get(configuredChannelId) || null
        : StreakService.findStreakChannel(guild);

      for (const key of keys) {
        const userId = StreakService.parseUserIdFromKey(key, guild.id);
        if (!userId) continue;

        const raw = await client.db.get(key, null);
        if (!raw) continue;

        const streak = StreakService.normalizeStreak(raw, guild.id, userId);

        // Streak is still alive while the last active day is today or yesterday.
        const alive = streak.lastDay && StreakService.daysBetween(streak.lastDay, today) <= 1;
        if (alive || streak.count <= 0 || streak.breakNotified) {
          continue;
        }

        const previousBest = streak.best;
        streak.count = 0;
        streak.breakNotified = true;
        streak.updatedAt = Date.now();
        await client.db.set(key, streak);

        logger.info('[STREAK] Streak broke', {
          guildId: guild.id,
          userId,
          previousBest,
        });

        if (!streakChannel) continue;

        try {
          const embed = createEmbed({
            title: '<a:NoFire:1572338994908373052> STREAK OUTAGES',
            description: `aww <@${userId}> your streak fire went out 😢 your last streak was **${previousBest} days**, come on, light it up again from scratch!`,
            color: 'error',
          });
          await streakChannel.send({ embeds: [embed], allowedMentions: { users: [userId] } }).catch(() => null);
        } catch (error) {
          logger.warn(`[STREAK] Failed to notify ${userId} about broken streak:`, error.message);
        }
      }
    }
  }
}

export function startStreakBreakChecker(client) {
  if (client.streakBreakCheckerTimer) return;

  // Check every minute; the actual break only fires once per user per break.
  client.streakBreakCheckerTimer = setInterval(() => {
    StreakService.checkBrokenStreaks(client).catch((error) => {
      logger.error('Streak break checker task failed:', error);
    });
  }, 60 * 1000);

  // Run once shortly after startup too.
  setTimeout(() => {
    StreakService.checkBrokenStreaks(client).catch((error) => {
      logger.error('Streak break checker (startup) failed:', error);
    });
  }, 10 * 1000);
}

export function stopStreakBreakChecker(client) {
  if (client.streakBreakCheckerTimer) {
    clearInterval(client.streakBreakCheckerTimer);
    client.streakBreakCheckerTimer = null;
  }
}

wrapServiceClassMethods(StreakService, (methodName) => ({
  service: 'StreakService',
  operation: methodName,
  message: `Streak service operation failed: ${methodName}`,
  userMessage: 'A streak operation failed. Please try again in a moment.',
}));

export default StreakService;
