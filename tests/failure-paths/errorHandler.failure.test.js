import test from 'node:test';
import assert from 'node:assert/strict';
import { MessageFlags } from 'discord.js';

import {
  handleInteractionError,
  replyUserError,
  ErrorTypes,
  createError
} from '../../src/utils/errorHandler.js';
import { buildUserErrorEmbed } from '../../src/utils/embeds.js';
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

test('buildUserErrorEmbed uses plain titles and typed colors', () => {
  const validationEmbed = buildUserErrorEmbed('validation', 'Check your input.');
  assert.equal(validationEmbed.data.title, 'Invalid Input');
  assert.equal(validationEmbed.data.description, 'Check your input.');

  const rateLimitEmbed = buildUserErrorEmbed('rate_limit', 'Wait a moment.');
  assert.equal(rateLimitEmbed.data.title, 'Too Fast');
});

test('handleInteractionError does not add tip fields', async () => {
  let replyPayload = null;
  const interaction = createInteraction({
    reply: async (payload) => {
      replyPayload = payload;
    }
  });

  await handleInteractionError(interaction, createError('rate limited', ErrorTypes.RATE_LIMIT), {});

  const embed = replyPayload?.embeds?.[0];
  assert.ok(embed);
  assert.equal(embed.data.fields?.length ?? 0, 0, 'error embeds should not include tip fields');
  assert.equal(embed.data.title, 'Too Fast');
});

test('replyUserError sends ephemeral replies for fresh interactions', async () => {
  let replyPayload = null;
  const interaction = createInteraction({
    reply: async (payload) => {
      replyPayload = payload;
    }
  });

  await replyUserError(interaction, {
    type: ErrorTypes.PERMISSION,
    message: 'You need Manage Server.'
  });

  assert.equal(replyPayload?.flags, MessageFlags.Ephemeral);
  assert.equal(replyPayload?.embeds?.[0]?.data?.title, 'Permission Denied');
  assert.equal(replyPayload?.embeds?.[0]?.data?.description, 'You need Manage Server.');
});

test('replyUserError uses editReply when interaction is deferred', async () => {
  let editPayload = null;
  const interaction = createInteraction({
    deferred: true,
    editReply: async (payload) => {
      editPayload = payload;
    }
  });

  await replyUserError(interaction, {
    type: ErrorTypes.VALIDATION,
    message: 'Missing required option.'
  });

  assert.ok(editPayload);
  assert.equal(editPayload.embeds?.[0]?.data?.title, 'Invalid Input');
});