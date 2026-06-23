import crypto from 'node:crypto';

function normalizeName(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : null;
}

function normalizeGuildId(value) {
  if (typeof value === 'string') {
    const trimmedValue = value.trim();
    return trimmedValue.length > 0 ? trimmedValue : null;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  return null;
}

function readHeader(req, headerName) {
  if (typeof req.get === 'function') {
    return req.get(headerName);
  }

  return req.headers?.[headerName.toLowerCase()] ?? null;
}

function extractAuthToken(req) {
  const authorizationHeader = readHeader(req, 'authorization');
  if (typeof authorizationHeader === 'string' && authorizationHeader.trim()) {
    const trimmedHeader = authorizationHeader.trim();
    if (trimmedHeader.toLowerCase().startsWith('bearer ')) {
      const bearerToken = trimmedHeader.slice(7).trim();
      return bearerToken || null;
    }

    return trimmedHeader;
  }

  const apiKeyHeader = readHeader(req, 'x-api-key');
  if (typeof apiKeyHeader === 'string' && apiKeyHeader.trim()) {
    return apiKeyHeader.trim();
  }

  return null;
}

function tokensMatch(expectedToken, providedToken) {
  if (typeof expectedToken !== 'string' || expectedToken.length === 0) {
    return false;
  }

  if (typeof providedToken !== 'string' || providedToken.length === 0) {
    return false;
  }

  const expectedBuffer = Buffer.from(expectedToken);
  const providedBuffer = Buffer.from(providedToken);

  if (expectedBuffer.length !== providedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, providedBuffer);
}

export function createPvpEventHandler({
  recordKill,
  logger,
  token,
  defaultGuildId = null,
  rateLimitWindowMs = 60_000,
  maxRequestsPerWindow = 30,
} = {}) {
  if (typeof recordKill !== 'function') {
    throw new TypeError('recordKill must be a function');
  }

  const requestCounts = new Map();

  return async function handlePvpEventWebhook(req, res) {
    const ip = req.ip ?? 'unknown';
    const now = Date.now();
    const windowStart = now - rateLimitWindowMs;

    if (!requestCounts.has(ip)) {
      requestCounts.set(ip, []);
    }

    const recentRequests = requestCounts.get(ip).filter((timestamp) => timestamp > windowStart);
    if (recentRequests.length >= maxRequestsPerWindow) {
      logger.warn('[PVP] PvP webhook rate limit exceeded', {
        event: 'api.pvp_event.rate_limited',
        ip,
      });
      return res.status(429).json({ error: 'Too many requests' });
    }

    recentRequests.push(now);
    requestCounts.set(ip, recentRequests);

    const providedToken = extractAuthToken(req);

    if (!tokensMatch(token, providedToken)) {
      logger.warn('[PVP] Rejected PvP webhook request due to failed authentication', {
        event: 'api.pvp_event.auth_failed',
        guildId: normalizeGuildId(req.body?.guildId) ?? normalizeGuildId(defaultGuildId),
        ip,
      });
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const killer = normalizeName(req.body?.killer);
    const victim = normalizeName(req.body?.victim);
    const guildId = normalizeGuildId(req.body?.guildId) ?? normalizeGuildId(defaultGuildId);

    if (!killer || !victim || !guildId) {
      logger.warn('[PVP] Rejected PvP webhook request due to invalid payload', {
        event: 'api.pvp_event.invalid_payload',
        guildId: guildId ?? null,
        ip,
      });
      return res.status(400).json({ error: 'Invalid payload' });
    }

    try {
      await recordKill(guildId, killer, victim);

      logger.info(`[PVP] Webhook recorded kill: ${killer} defeated ${victim} in guild ${guildId}`);
      return res.status(200).json({ success: true });
    } catch (error) {
      logger.error(`[PVP] Error handling PvP webhook for guild ${guildId}:`, error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  };
}
