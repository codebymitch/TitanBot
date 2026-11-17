// streakRoutes.js
//
// HTTP surface for individual (per-user) streaks. Mounted by the bot's web
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
    userId: streak.userId,
    current: streak.currentCount,
    count: streak.count,
    best: streak.best,
    totalDays: streak.totalDays,
    active: streak.active,
    lastDay: streak.lastDay,
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
      const streak = await StreakService.getUserStreak(client, req.params.guildId, req.params.userId);
      res.json({
        guildId: req.params.guildId,
        userId: req.params.userId,
        streak: streak ? serializeStreak(streak) : null,
      });
    } catch (error) {
      sendError(res, error, 'Failed to load streak for user.');
    }
  });

  router.post('/:guildId/activity', async (req, res) => {
    try {
      const { userId, timestamp } = req.body || {};
      const result = await StreakService.recordActivity(client, req.params.guildId, userId, { timestamp });

      res.status(201).json({
        recorded: true,
        incremented: result.incremented,
        day: result.day,
        streak: serializeStreak(result.streak),
      });
    } catch (error) {
      sendError(res, error, 'Failed to record streak activity.');
    }
  });

  app.use('/api/streaks', router);
  logger.info('[STREAK_API] Streak endpoints mounted at /api/streaks');

  return router;
}

export default registerStreakApi;
