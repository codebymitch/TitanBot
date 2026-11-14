// streakService.js
//
// TikTok-style pairwise streaks. A streak is tracked between exactly two users
// inside a guild and only becomes active once the invited user accepts the
// streak request. It then advances by one day each time BOTH users interact
// with each other on the same UTC calendar day. If a full day passes without
// both users interacting, the streak is considered broken and resets to 0.

import { logger } from '../utils/logger.js';
import { createError, ErrorTypes } from '../utils/errorHandler.js';
import { wrapServiceClassMethods } from '../utils/serviceErrorBoundary.js';
import { validateDiscordId } from '../utils/validation.js';

const STREAK_KEY_PREFIX = 'guild:';
const DAY_MS = 24 * 60 * 60 * 1000;

class StreakService {
  static MAX_LEADERBOARD_SIZE = 25;

  static sortUserIds(userA, userB) {
    return [String(userA), String(userB)].sort();
  }

  static buildPrefix(guildId) {
    return `${STREAK_KEY_PREFIX}${guildId}:streak:`;
  }

  static buildStreakKey(guildId, userA, userB) {
    const [first, second] = StreakService.sortUserIds(userA, userB);
    return `${StreakService.buildPrefix(guildId)}${first}_${second}`;
  }

  static parseUsersFromKey(key, guildId) {
    const prefix = StreakService.buildPrefix(guildId);
    if (typeof key !== 'string' || !key.startsWith(prefix)) {
      return null;
    }

    const parts = key.slice(prefix.length).split('_');
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      return null;
    }

    return parts;
  }

  static buildRequestPrefix(guildId) {
    return `${STREAK_KEY_PREFIX}${guildId}:streakreq:`;
  }

  static buildRequestKey(guildId, fromUserId, toUserId) {
    return `${StreakService.buildRequestPrefix(guildId)}${String(fromUserId)}_${String(toUserId)}`;
  }

  static parseRequestKey(key, guildId) {
    const prefix = StreakService.buildRequestPrefix(guildId);
    if (typeof key !== 'string' || !key.startsWith(prefix)) {
      return null;
    }

    const parts = key.slice(prefix.length).split('_');
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      return null;
    }

    return { from: parts[0], to: parts[1] };
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

  static assertPair(guildId, userA, userB, context = {}) {
    const validGuildId = validateDiscordId(guildId, 'guildId');
    const validUserA = validateDiscordId(String(userA), 'userA');
    const validUserB = validateDiscordId(String(userB), 'userB');

    if (!validGuildId || !validUserA || !validUserB) {
      throw createError(
        'Invalid streak identifiers',
        ErrorTypes.VALIDATION,
        'A valid guild and two users are required to track a streak.',
        { guildId, userA, userB, ...context }
      );
    }

    if (validUserA === validUserB) {
      throw createError(
        'Cannot create a streak with self',
        ErrorTypes.VALIDATION,
        'A streak needs two different users.',
        { guildId, userId: validUserA, ...context }
      );
    }

    return { guildId: validGuildId, userA: validUserA, userB: validUserB };
  }

  static normalizeStreak(raw, guildId, users) {
    const [first, second] = StreakService.sortUserIds(users[0], users[1]);
    const base = raw && typeof raw === 'object' ? raw : {};
    const lastInteraction = base.lastInteraction && typeof base.lastInteraction === 'object'
      ? { ...base.lastInteraction }
      : {};

    const asPositiveInt = (value) => (Number.isFinite(value) && value > 0 ? Math.floor(value) : 0);

    return {
      guildId: String(guildId),
      users: [first, second],
      accepted: base.accepted === true,
      acceptedAt: Number(base.acceptedAt) || null,
      count: asPositiveInt(base.count),
      best: asPositiveInt(base.best),
      totalInteractions: asPositiveInt(base.totalInteractions),
      lastBothDay: typeof base.lastBothDay === 'string' ? base.lastBothDay : null,
      lastInteraction,
      createdAt: Number(base.createdAt) || null,
      updatedAt: Number(base.updatedAt) || null,
    };
  }

  static normalizeRequest(raw, guildId, fromUserId, toUserId) {
    const base = raw && typeof raw === 'object' ? raw : {};
    return {
      guildId: String(guildId),
      from: String(fromUserId),
      to: String(toUserId),
      status: typeof base.status === 'string' ? base.status : 'pending',
      createdAt: Number(base.createdAt) || null,
      respondedAt: Number(base.respondedAt) || null,
    };
  }

  /** A streak stays alive while the last counted day is today or yesterday. */
  static isActive(streak, referenceTime = Date.now()) {
    if (!streak?.lastBothDay) {
      return false;
    }

    const today = StreakService.toDayKey(referenceTime);
    return StreakService.daysBetween(streak.lastBothDay, today) <= 1;
  }

  static withStatus(streak, referenceTime = Date.now()) {
    const active = StreakService.isActive(streak, referenceTime);
    return {
      ...streak,
      active,
      currentCount: active ? streak.count : 0,
      lastBothAt: streak.lastBothDay ? Date.parse(`${streak.lastBothDay}T00:00:00Z`) : null,
    };
  }

  static async getStreak(client, guildId, userA, userB) {
    const ids = StreakService.assertPair(guildId, userA, userB, { operation: 'getStreak' });

    const raw = await client.db.get(
      StreakService.buildStreakKey(ids.guildId, ids.userA, ids.userB),
      null
    );

    if (!raw) {
      return null;
    }

    return StreakService.withStatus(StreakService.normalizeStreak(raw, ids.guildId, [ids.userA, ids.userB]));
  }

  /**
   * Record a one-way interaction from `fromUserId` to `toUserId`. The streak
   * increments at most once per UTC day, once both directions have been seen.
   */
  static async recordInteraction(client, guildId, fromUserId, toUserId, options = {}) {
    const ids = StreakService.assertPair(guildId, fromUserId, toUserId, { operation: 'recordInteraction' });
    const timestamp = Number(options.timestamp) > 0 ? Number(options.timestamp) : Date.now();
    const day = StreakService.toDayKey(timestamp);
    const key = StreakService.buildStreakKey(ids.guildId, ids.userA, ids.userB);

    const raw = await client.db.get(key, null);

    // Streaks only count after the invited user accepted the request.
    if (!raw || raw.accepted !== true) {
      return {
        recorded: false,
        reason: raw ? 'not_accepted' : 'no_streak',
        incremented: false,
        day,
        streak: raw
          ? StreakService.withStatus(StreakService.normalizeStreak(raw, ids.guildId, [ids.userA, ids.userB]), timestamp)
          : null,
      };
    }

    const streak = StreakService.normalizeStreak(raw, ids.guildId, [ids.userA, ids.userB]);

    if (!streak.createdAt) {
      streak.createdAt = timestamp;
    }

    // Missed at least one full day -> the previous run is broken.
    if (streak.lastBothDay && StreakService.daysBetween(streak.lastBothDay, day) > 1) {
      streak.count = 0;
    }

    streak.lastInteraction[String(fromUserId)] = timestamp;

    const partnerId = String(fromUserId) === ids.userA ? ids.userB : ids.userA;
    const partnerDay = StreakService.toDayKey(streak.lastInteraction[partnerId]);
    let incremented = false;

    if (streak.lastBothDay !== day && partnerDay === day) {
      streak.count += 1;
      streak.lastBothDay = day;
      if (streak.count > streak.best) {
        streak.best = streak.count;
      }
      incremented = true;
    }

    streak.totalInteractions += 1;
    streak.updatedAt = timestamp;

    await client.db.set(key, streak);

    if (incremented) {
      logger.info('[STREAK] Streak advanced', {
        guildId: ids.guildId,
        users: ids,
        count: streak.count,
        day,
      });
    }

    return {
      recorded: true,
      reason: null,
      streak: StreakService.withStatus(streak, timestamp),
      incremented,
      day,
      direction: { from: String(fromUserId), to: partnerId },
    };
  }

  static async getStreakRequest(client, guildId, fromUserId, toUserId) {
    const ids = StreakService.assertPair(guildId, fromUserId, toUserId, { operation: 'getStreakRequest' });
    const raw = await client.db.get(StreakService.buildRequestKey(ids.guildId, ids.userA, ids.userB), null);

    if (!raw) {
      return null;
    }

    return StreakService.normalizeRequest(raw, ids.guildId, ids.userA, ids.userB);
  }

  static async sendStreakRequest(client, guildId, fromUserId, toUserId, meta = {}) {
    const ids = StreakService.assertPair(guildId, fromUserId, toUserId, { operation: 'sendStreakRequest' });

    const existingStreak = await client.db.get(
      StreakService.buildStreakKey(ids.guildId, ids.userA, ids.userB),
      null
    );
    if (existingStreak?.accepted === true) {
      throw createError(
        'Streak already exists',
        ErrorTypes.VALIDATION,
        'You already have an active streak with this user.',
        { guildId: ids.guildId, fromUserId: ids.userA, toUserId: ids.userB, operation: 'sendStreakRequest' }
      );
    }

    const requestKey = StreakService.buildRequestKey(ids.guildId, ids.userA, ids.userB);
    const existingRequest = await client.db.get(requestKey, null);
    if (existingRequest) {
      throw createError(
        'Streak request already pending',
        ErrorTypes.VALIDATION,
        'You already have a pending streak request with this user.',
        { guildId: ids.guildId, fromUserId: ids.userA, toUserId: ids.userB, operation: 'sendStreakRequest' }
      );
    }

    const request = {
      guildId: ids.guildId,
      fromUserId: ids.userA,
      toUserId: ids.userB,
      status: 'pending',
      createdAt: Date.now(),
      respondedAt: null,
      channelId: meta.channelId ? String(meta.channelId) : null,
      messageId: meta.messageId ? String(meta.messageId) : null,
    };

    await client.db.set(requestKey, request);

    logger.info('[STREAK] Request sent', { guildId: ids.guildId, from: ids.userA, to: ids.userB });

    return StreakService.normalizeRequest(request, ids.guildId, ids.userA, ids.userB);
  }

  static async acceptStreakRequest(client, guildId, fromUserId, toUserId) {
    const ids = StreakService.assertPair(guildId, fromUserId, toUserId, { operation: 'acceptStreakRequest' });
    const requestKey = StreakService.buildRequestKey(ids.guildId, ids.userA, ids.userB);
    const raw = await client.db.get(requestKey, null);

    if (!raw) {
      throw createError(
        'Streak request not found',
        ErrorTypes.VALIDATION,
        'This streak request is no longer available.',
        { guildId: ids.guildId, fromUserId: ids.userA, toUserId: ids.userB, operation: 'acceptStreakRequest' }
      );
    }

    const timestamp = Date.now();
    const streakKey = StreakService.buildStreakKey(ids.guildId, ids.userA, ids.userB);
    const streak = StreakService.normalizeStreak(await client.db.get(streakKey, null), ids.guildId, [ids.userA, ids.userB]);

    streak.accepted = true;
    streak.acceptedAt = streak.acceptedAt || timestamp;
    streak.createdAt = streak.createdAt || timestamp;
    streak.updatedAt = timestamp;

    await client.db.set(streakKey, streak);
    await client.db.delete(requestKey);

    logger.info('[STREAK] Request accepted', { guildId: ids.guildId, users: [ids.userA, ids.userB] });

    return {
      streak: StreakService.withStatus(streak, timestamp),
      request: StreakService.normalizeRequest(raw, ids.guildId, ids.userA, ids.userB),
    };
  }

  static async declineStreakRequest(client, guildId, fromUserId, toUserId) {
    const ids = StreakService.assertPair(guildId, fromUserId, toUserId, { operation: 'declineStreakRequest' });
    const requestKey = StreakService.buildRequestKey(ids.guildId, ids.userA, ids.userB);
    const raw = await client.db.get(requestKey, null);

    if (!raw) {
      throw createError(
        'Streak request not found',
        ErrorTypes.VALIDATION,
        'This streak request is no longer available.',
        { guildId: ids.guildId, fromUserId: ids.userA, toUserId: ids.userB, operation: 'declineStreakRequest' }
      );
    }

    await client.db.delete(requestKey);

    logger.info('[STREAK] Request declined', { guildId: ids.guildId, from: ids.userA, to: ids.userB });

    return StreakService.normalizeRequest(raw, ids.guildId, ids.userA, ids.userB);
  }

  static async getPendingRequests(client, guildId, userId, options = {}) {
    const validGuildId = validateDiscordId(guildId, 'guildId');
    const validUserId = validateDiscordId(String(userId), 'userId');

    if (!validGuildId || !validUserId) {
      throw createError(
        'Invalid streak identifiers',
        ErrorTypes.VALIDATION,
        'A valid guild and user are required.',
        { guildId, userId, operation: 'getPendingRequests' }
      );
    }

    const direction = options.direction || 'all';
    const keys = await client.db.list(StreakService.buildRequestPrefix(validGuildId));
    const results = [];

    for (const key of keys) {
      const parsed = StreakService.parseRequestKey(key, validGuildId);
      if (!parsed) {
        continue;
      }

      const isIncoming = parsed.to === validUserId;
      const isOutgoing = parsed.from === validUserId;
      if (direction === 'incoming' && !isIncoming) continue;
      if (direction === 'outgoing' && !isOutgoing) continue;
      if (direction === 'all' && !isIncoming && !isOutgoing) continue;

      const raw = await client.db.get(key, null);
      if (!raw) {
        continue;
      }

      results.push(StreakService.normalizeRequest(raw, validGuildId, parsed.from, parsed.to));
    }

    results.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    return results;
  }

  static async getUserStreaks(client, guildId, userId, options = {}) {
    const validGuildId = validateDiscordId(guildId, 'guildId');
    const validUserId = validateDiscordId(String(userId), 'userId');

    if (!validGuildId || !validUserId) {
      throw createError(
        'Invalid streak identifiers',
        ErrorTypes.VALIDATION,
        'A valid guild and user are required.',
        { guildId, userId, operation: 'getUserStreaks' }
      );
    }

    const keys = await client.db.list(StreakService.buildPrefix(validGuildId));
    const results = [];

    for (const key of keys) {
      const users = StreakService.parseUsersFromKey(key, validGuildId);
      if (!users || !users.includes(validUserId)) {
        continue;
      }

      const raw = await client.db.get(key, null);
      if (!raw) {
        continue;
      }

      const streak = StreakService.withStatus(StreakService.normalizeStreak(raw, validGuildId, users));
      if (!streak.accepted) {
        continue;
      }
      if (options.activeOnly && !streak.active) {
        continue;
      }
      results.push(streak);
    }

    results.sort((a, b) => b.currentCount - a.currentCount || b.best - a.best || (b.updatedAt || 0) - (a.updatedAt || 0));
    return results;
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
      const users = StreakService.parseUsersFromKey(key, validGuildId);
      if (!users) {
        continue;
      }

      const raw = await client.db.get(key, null);
      if (!raw) {
        continue;
      }

      const streak = StreakService.withStatus(StreakService.normalizeStreak(raw, validGuildId, users));
      if (!streak.accepted || streak.currentCount <= 0) {
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
