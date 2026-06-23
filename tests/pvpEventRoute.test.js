import test from 'node:test';
import assert from 'node:assert/strict';

import { createPvpEventHandler } from '../src/api/pvpEventRoute.js';

function createResponse() {
  return {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

function createLogger() {
  return {
    infoMessages: [],
    warnMessages: [],
    errorMessages: [],
    info(message) {
      this.infoMessages.push(message);
    },
    warn(message, meta) {
      this.warnMessages.push({ message, meta });
    },
    error(message, error) {
      this.errorMessages.push({ message, error });
    },
  };
}

test('returns 401 when PvP webhook auth is missing or invalid', async () => {
  const logger = createLogger();
  const recordKillCalls = [];
  const handler = createPvpEventHandler({
    recordKill: async (...args) => recordKillCalls.push(args),
    logger,
    token: 'secret-token',
  });

  const req = {
    body: { killer: 'Alice', victim: 'Bob', guildId: 'guild-1' },
    headers: {},
    ip: '127.0.0.1',
  };
  const res = createResponse();

  await handler(req, res);

  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.body, { error: 'Unauthorized' });
  assert.equal(recordKillCalls.length, 0);
  assert.equal(logger.warnMessages.length, 1);
});

test('returns 400 when PvP webhook payload is invalid', async () => {
  const logger = createLogger();
  const handler = createPvpEventHandler({
    recordKill: async () => {},
    logger,
    token: 'secret-token',
  });

  const req = {
    body: { killer: 'Alice', victim: '   ', guildId: 'guild-1' },
    headers: { authorization: 'secret-token' },
    ip: '127.0.0.1',
  };
  const res = createResponse();

  await handler(req, res);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: 'Invalid payload' });
  assert.equal(logger.warnMessages.length, 1);
});

test('records PvP webhook events successfully with request guildId', async () => {
  const logger = createLogger();
  const recordKillCalls = [];
  const handler = createPvpEventHandler({
    recordKill: async (...args) => recordKillCalls.push(args),
    logger,
    token: 'secret-token',
  });

  const req = {
    body: { killer: 'Alice', victim: 'Bob', guildId: 'guild-1' },
    headers: { 'x-api-key': 'secret-token' },
    ip: '127.0.0.1',
  };
  const res = createResponse();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { success: true });
  assert.deepEqual(recordKillCalls, [['guild-1', 'Alice', 'Bob']]);
  assert.equal(logger.infoMessages.length, 1);
});

test('uses configured default guildId when the webhook payload omits guildId', async () => {
  const logger = createLogger();
  const recordKillCalls = [];
  const handler = createPvpEventHandler({
    recordKill: async (...args) => recordKillCalls.push(args),
    logger,
    token: 'secret-token',
    defaultGuildId: 'default-guild',
  });

  const req = {
    body: { killer: 'Alice', victim: 'Bob' },
    headers: { authorization: 'secret-token' },
    ip: '127.0.0.1',
  };
  const res = createResponse();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(recordKillCalls, [['default-guild', 'Alice', 'Bob']]);
});

test('returns 500 and logs when PvP event recording fails', async () => {
  const logger = createLogger();
  const handler = createPvpEventHandler({
    recordKill: async () => {
      throw new Error('db write failed');
    },
    logger,
    token: 'secret-token',
  });

  const req = {
    body: { killer: 'Alice', victim: 'Bob', guildId: 'guild-1' },
    headers: { authorization: 'secret-token' },
    ip: '127.0.0.1',
  };
  const res = createResponse();

  await handler(req, res);

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: 'Internal server error' });
  assert.equal(logger.errorMessages.length, 1);
});
