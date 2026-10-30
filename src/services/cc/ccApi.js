// ccApi.js — the HTTP API the games bot uses to read and pay Chaos Credits.
//
// The games live in a separate bot now, but CC stays here (one balance, one Top CC).
// The games bot reports results to this API and this bot pays them with the usual rules from
// config/cc.js. Every request needs `Authorization: Bearer <CC_API_TOKEN>`; without CC_API_TOKEN
// (at least 16 characters) the API answers 503 and changes nothing.
//
//   GET  /api/cc/:guildId/users/:userId   balance and stats of a member
//   GET  /api/cc/:guildId/top?limit=10    leaderboard (1–100 rows)
//   POST /api/cc/:guildId/group-game      { game, players: [ids], ranking: [ids, 1st first] }
//                                          pays the top 3 like our group games did
//   POST /api/cc/:guildId/solo-win        { userId, game }  solo win, capped per day
//   POST /api/cc/:guildId/add             { userId, amount, reason }  custom reward (max 10,000)
//   POST /api/cc/:guildId/spend           { userId, amount, reason }  entry fees / bets
//
// POST bodies may carry a `requestId`: the same requestId within 10 minutes returns the first
// answer again without paying twice, so the games bot can safely retry after a timeout.
// Full guide: docs/cc-and-games.md.

import crypto from 'node:crypto';
import express from 'express';
import { logger } from '../../utils/logger.js';
import { awardGroupGame, awardSoloWin, getLeaderboard, getProfile, grantCC, spendCC } from './ccService.js';
import { ccBoost } from '../../config/cc.js';

export const CC_API_MAX_AMOUNT = 10_000;
const MIN_TOKEN_LENGTH = 16;
const MAX_PLAYERS = 100;
const REQUEST_ID_TTL_MS = 10 * 60 * 1000;
const SNOWFLAKE = /^\d{17,20}$/;
const NAME = /^[\p{L}\p{N} _.:-]{1,64}$/u;

class ApiError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

function digest(value) {
    return crypto.createHash('sha256').update(String(value)).digest();
}

/** Whether the request carries the right token (constant-time compare). */
export function isAuthorized(header, token) {
    if (!token || token.length < MIN_TOKEN_LENGTH) return false;
    const match = /^Bearer\s+(.+)$/i.exec(String(header || ''));
    return Boolean(match) && crypto.timingSafeEqual(digest(match[1].trim()), digest(token));
}

function userId(value, field = 'userId') {
    if (typeof value !== 'string' || !SNOWFLAKE.test(value)) throw new ApiError(400, `${field} must be a Discord user ID string`);
    return value;
}

function userIds(value, field) {
    if (!Array.isArray(value) || value.length > MAX_PLAYERS) throw new ApiError(400, `${field} must be an array of up to ${MAX_PLAYERS} user IDs`);
    const ids = value.map((id) => userId(id, field));
    if (new Set(ids).size !== ids.length) throw new ApiError(400, `${field} has the same user twice`);
    return ids;
}

function amount(value) {
    if (!Number.isSafeInteger(value) || value <= 0 || value > CC_API_MAX_AMOUNT) {
        throw new ApiError(400, `amount must be a whole number from 1 to ${CC_API_MAX_AMOUNT}`);
    }
    return value;
}

function name(value, field, fallback) {
    if (value === undefined || value === null || value === '') return fallback;
    if (typeof value !== 'string' || !NAME.test(value)) throw new ApiError(400, `${field} must be 1–64 letters, numbers, spaces or _.:-`);
    return value;
}

function reason(value) {
    if (value === undefined || value === null) return '';
    if (typeof value !== 'string' || value.length > 200) throw new ApiError(400, 'reason must be a string of up to 200 characters');
    return value;
}

/** Answers of recent requestIds, so a retried POST never pays twice. */
function createRequestCache(now = () => Date.now()) {
    const entries = new Map();
    return {
        async run(key, work) {
            const time = now();
            for (const [k, entry] of entries) if (entry.expiresAt <= time) entries.delete(k);
            if (!key) return work();
            if (entries.has(key)) return entries.get(key).result;
            // Store the promise first so two copies of the same request arriving together only run once.
            const result = work();
            entries.set(key, { result, expiresAt: time + REQUEST_ID_TTL_MS });
            result.catch(() => entries.delete(key));
            return result;
        },
    };
}

/**
 * The /api/cc router. `options.token` defaults to process.env.CC_API_TOKEN and is read per request,
 * so setting the variable only needs a restart, never a code change.
 */
export function createCCApiRouter(client, { token = () => process.env.CC_API_TOKEN } = {}) {
    const router = express.Router();
    const cache = createRequestCache();
    const getToken = typeof token === 'function' ? token : () => token;

    router.use((req, res, next) => {
        const secret = getToken();
        if (!secret || secret.length < MIN_TOKEN_LENGTH) {
            return res.status(503).json({ error: `CC API is off: set CC_API_TOKEN (${MIN_TOKEN_LENGTH}+ characters)` });
        }
        if (!isAuthorized(req.headers.authorization, secret)) {
            logger.warn('[CC API] Rejected request with a wrong or missing token', { path: req.path, ip: req.ip });
            return res.status(401).json({ error: 'Unauthorized' });
        }
        next();
    });
    router.use(express.json({ limit: '16kb' }));

    // Only guilds this bot is in, so a typo can't create CC records for a random guild.
    router.param('guildId', (req, res, next, guildId) => {
        if (!SNOWFLAKE.test(guildId) || !client.guilds?.cache?.has(guildId)) {
            return res.status(404).json({ error: 'Unknown guild' });
        }
        next();
    });

    const handle = (work) => async (req, res) => {
        try {
            const body = req.body && typeof req.body === 'object' ? req.body : {};
            const requestId = body.requestId === undefined ? null : name(String(body.requestId), 'requestId', null);
            const key = requestId ? `${req.params.guildId}:${req.path}:${requestId}` : null;
            res.status(200).json(await cache.run(key, () => Promise.resolve().then(() => work(req.params.guildId, body, req))));
        } catch (error) {
            if (error instanceof ApiError) return res.status(error.status).json({ error: error.message });
            logger.error('[CC API] Request failed', error);
            res.status(500).json({ error: 'Internal error' });
        }
    };

    router.get('/:guildId/users/:userId', handle(async (guildId, body, req) => {
        const { cc, stats } = await getProfile(client, guildId, userId(req.params.userId));
        return { userId: req.params.userId, cc, stats };
    }));

    router.get('/:guildId/top', handle(async (guildId, body, req) => {
        const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 10));
        const board = await getLeaderboard(client, guildId);
        return { members: board.length, total: board.reduce((sum, row) => sum + row.cc, 0), top: board.slice(0, limit) };
    }));

    router.post('/:guildId/group-game', handle(async (guildId, body) => {
        const game = name(body.game, 'game', 'external');
        const players = userIds(body.players, 'players');
        const ranking = userIds(body.ranking, 'ranking');
        if (players.length < 2) throw new ApiError(400, 'players needs at least 2 members');
        if (ranking.some((id) => !players.includes(id))) throw new ApiError(400, 'everyone in ranking must be in players');
        const paid = await awardGroupGame(client, guildId, { game: `bot:${game}`, ranking, playerIds: players });
        return { paid };
    }));

    router.post('/:guildId/solo-win', handle(async (guildId, body) => {
        const game = name(body.game, 'game', 'external');
        const result = await awardSoloWin(client, guildId, userId(body.userId), `bot:${game}`);
        if (result.failed) throw new Error('Solo win could not be saved');
        return { amount: result.amount, capped: result.capped, balance: result.balance };
    }));

    router.post('/:guildId/add', handle(async (guildId, body) => {
        // Custom rewards follow the CC event multiplier like every other game reward.
        const result = await grantCC(client, guildId, userId(body.userId), amount(body.amount) * ccBoost(), { source: 'games-bot', reason: reason(body.reason) });
        return { ok: true, amount: result.amount, balance: result.balance };
    }));

    router.post('/:guildId/spend', handle(async (guildId, body) => {
        const result = await spendCC(client, guildId, userId(body.userId), amount(body.amount), `games-bot: ${reason(body.reason)}`);
        return { ok: result.ok, balance: result.balance };
    }));

    router.use((req, res) => res.status(404).json({ error: 'Not found' }));
    // Broken JSON bodies (and bodies over 16kb) get a JSON answer instead of express's HTML page.
    router.use((error, req, res, next) => {
        if (res.headersSent) return next(error);
        res.status(error.status >= 400 && error.status < 500 ? error.status : 400).json({ error: 'Invalid request body' });
    });
    return router;
}
