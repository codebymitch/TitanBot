import test from 'node:test';
import assert from 'node:assert/strict';

import { handleInteractionError } from '../../src/utils/errorHandler.js';
import { logger } from '../../src/utils/logger.js';

function createLoggerCapture() {
  const entries = [];
  const originals = {
    warn: logger.warn,
    error: logger.error,
    debug: logger.debug
  };

  logger.warn = (message, meta) => entries.push({ level: 'warn', message, meta });
  logger.error = (message, meta) => entries.push({ level: 'error', message, meta });
  logger.debug = (message, meta) => entries.push({ level: 'debug', message, meta });

  return {
    entries,
    restore() {
      logger.warn = originals.warn;
      logger.error = originals.error;
      logger.debug = originals.debug;
    }
  };
}

function createInteraction(overrides = {}) {
  return {
    id: 'interaction-1',
    createdTimestamp: Date.now(),
    deferred: false,
    replied: false,
    guildId: 'guild-1',
    channelId: 'channel-1',
    commandName: 'ping',
    type: 2,
    customId: null,
    user: { id: 'user-1' },
    async reply() {},
    async editReply() {},
    ...overrides
  };
}

test('expired interaction path logs INTERACTION_EXPIRED and skips reply', async () => {
  const capture = createLoggerCapture();
  let replyCalled = false;

  try {
    const interaction = createInteraction({
      createdTimestamp: Date.now() - (15 * 60 * 1000),
      reply: async () => {
        replyCalled = true;
      }
    });

    const error = new Error('database timeout during operation');
    await handleInteractionError(interaction, error, {});

    assert.equal(replyCalled, false, 'expired interactions should not attempt reply');

    const expiredLog = capture.entries.find(
      (entry) => entry.level === 'warn' && entry.meta?.event === 'interaction.error.expired'
    );

    assert.ok(expiredLog, 'should log interaction expiry event');
    assert.equal(expiredLog.meta?.errorCode, 'INTERACTION_EXPIRED');
  } finally {
    capture.restore();
  }
});

test('Discord API response failure path logs response_unavailable when API says expired', async () => {
  const capture = createLoggerCapture();

  try {
    const interaction = createInteraction({
      reply: async () => {
        const err = new Error('Unknown interaction');
        err.code = 10062;
        throw err;
      }
    });

    const apiError = new Error('Discord API request failed');
    apiError.code = 10062;

    await handleInteractionError(interaction, apiError, {});

    const unavailableLog = capture.entries.find(
      (entry) => entry.level === 'warn' && entry.meta?.event === 'interaction.error.response_unavailable'
    );

    assert.ok(unavailableLog, 'should log unavailable response event');
    assert.equal(unavailableLog.meta?.errorCode, '10062');
  } finally {
    capture.restore();
  }
});
