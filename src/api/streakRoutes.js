// streakRoutes.js
//
// HTTP surface for TikTok-style pairwise streaks. Mounted by the bot's web
// server (src/app.js) under /api/streaks.
//
// Optional auth: set STREAK_API_KEY to require an x-api-key header (or
// "Authorization: Bearer <key>") on every request. When unset, the endpoints
// are open, matching the bot's other public endpoints.

import express from 'express';
import { logger } from '../utils/logger.js';
import { ErrorTypes } from '../utils/errorHandler.js';
import StreakService from '../services/streakService.js';

const STATUS_BY_ERROR_TYPE = {
  [ErrorTypes.VALIDATION]: 400,
  [ErrorTypes.USER_INPUT]: 400,
  [ErrorTypes.CONFIGURATION]: 400,
  [ErrorTypes.PERMISSION]: 403,
  [ErrorTypes.RATE_LIMIT]: 429,
  [ErrorTypes.DATABASE]: 503,
};

function resolveStatus(error) {
  return STATUS_BY_ERROR_TYPE[error?.type] || 500;
}

function sendError(res, error, fallbackMessage) {
  const status = resolveStatus(error);
  const isServerError = status >= 500;

  if (isServerError) {
    logger.error('[STREAK_API] Request failed', { error: error?.message, type: error?.type });
  }

  res.status(status).json({
    error: isServerError ? 'internal_error' : (error?.type || 'request_error'),
    message: isServerError ? fallbackMessage : (error?.userMessage || error?.message || fallbackMessage),
  });
}

function serializeStreak(streak) {
  return {
    guildId: streak.guildId,
    users: streak.users,
    current: streak.currentCount,
    count: streak.count,
    best: streak.best,
    active: streak.active,
    lastBothDay: streak.lastBothDay,
    lastInteraction: streak.lastInteraction,
    totalInteractions: streak.totalInteractions,
    updatedAt: streak.updatedAt,
  };
}

function requireApiKey(req, res, next) {
  const configuredKey = process.env.STREAK_API_KEY;
  if (!configuredKey) {
    return next();
  }

  const headerKey = req.get('x-api-key');
  const bearerKey = req.get('authorization')?.replace(/^Bearer\s+/i, '');
  const providedKey = headerKey || bearerKey;

  if (providedKey && providedKey === configuredKey) {
    return next();
  }

  return res.status(401).json({
    error: 'unauthorized',
    message: 'A valid API key is required.',
  });
}

export function registerStreakApi(app, client) {
  const router = express.Router();
  router.use(express.json({ limit: '10kb' }));
  router.use(requireApiKey);

  if (!process.env.STREAK_API_KEY) {
    logger.warn('[STREAK_API] STREAK_API_KEY is not set — streak endpoints are publicly writable.');
  }

  router.get('/:guildId/leaderboard', async (req, res) => {
    try {
      const limit = Number.parseInt(req.query.limit, 10) || 10;
      const entries = await StreakService.getGuildLeaderboard(client, req.params.guildId, { limit });
      res.json({ guildId: req.params.guildId, streaks: entries.map(serializeStreak) });
    } catch (error) {
      sendError(res, error, 'Failed to load streak leaderboard.');
    }
  });

  router.get('/:guildId/user/:userId', async (req, res) => {
    try {
      const activeOnly = req.query.active !== 'false';
      const streaks = await StreakService.getUserStreaks(client, req.params.guildId, req.params.userId, { activeOnly });
      res.json({
        guildId: req.params.guildId,
        userId: req.params.userId,
        streaks: streaks.map(serializeStreak),
      });
    } catch (error) {
      sendError(res, error, 'Failed to load streaks for user.');
    }
  });

  router.get('/:guildId/pair/:userA/:userB', async (req, res) => {
    try {
      const { guildId, userA, userB } = req.params;
      const streak = await StreakService.getStreak(client, guildId, userA, userB);
      res.json({ guildId, users: StreakService.sortUserIds(userA, userB), streak: streak ? serializeStreak(streak) : null });
    } catch (error) {
      sendError(res, error, 'Failed to load streak for pair.');
    }
  });

  router.post('/:guildId/interactions', async (req, res) => {
    try {
      const { fromUserId, toUserId, timestamp } = req.body || {};
      const result = await StreakService.recordInteraction(client, req.params.guildId, fromUserId, toUserId, { timestamp });
      res.status(201).json({ incremented: result.incremented, day: result.day, streak: serializeStreak(result.streak) });
    } catch (error) {
      sendError(res, error, 'Failed to record streak interaction.');
    }
  });

  app.use('/api/streaks', router);
  logger.info('[STREAK_API] Streak endpoints mounted at /api/streaks');

  return router;
}

export default registerStreakApi;
