import test from 'node:test';
import assert from 'node:assert/strict';

import {
  enforceAbuseProtection,
  formatCooldownDuration,
  isRiskyCommand,
  resetAbuseProtectionState
} from '../../src/utils/abuseProtection.js';
import { logger } from '../../src/utils/logger.js';

function createInteraction(overrides = {}) {
  return {
    guildId: 'guild-1',
    user: { id: 'user-1' },
    ...overrides
  };
}

test('detects risky commands by category and explicit name', () => {
  assert.equal(isRiskyCommand({ category: 'moderation' }, 'ban'), true);
  assert.equal(isRiskyCommand({ category: 'fun' }, 'wipedata'), true);
  assert.equal(isRiskyCommand({ category: 'fun' }, 'ping'), false);
});

test('blocks risky command after cooldown limit is exceeded', async () => {
  resetAbuseProtectionState();
  const interaction = createInteraction();
  const riskyCommand = { category: 'moderation' };

  const first = await enforceAbuseProtection(interaction, riskyCommand, 'ban');
  const second = await enforceAbuseProtection(interaction, riskyCommand, 'ban');
  const third = await enforceAbuseProtection(interaction, riskyCommand, 'ban');

  assert.equal(first.allowed, true);
  assert.equal(second.allowed, true);
  assert.equal(third.allowed, false);
  assert.ok(third.remainingMs > 0);
});

test('supports command-level abuse policy overrides', async () => {
  resetAbuseProtectionState();
  const interaction = createInteraction();
  const command = {
    category: 'fun',
    abuseProtection: {
      enabled: true,
      maxAttempts: 1,
      windowMs: 5_000
    }
  };

  const first = await enforceAbuseProtection(interaction, command, 'custom-risky');
  const second = await enforceAbuseProtection(interaction, command, 'custom-risky');

  assert.equal(first.allowed, true);
  assert.equal(second.allowed, false);
  assert.equal(second.policy.maxAttempts, 1);
  assert.equal(second.policy.windowMs, 5_000);
});

test('logs anomaly warning after repeated blocked attempts', async () => {
  resetAbuseProtectionState();
  const interaction = createInteraction({ guildId: 'guild-2', user: { id: 'user-2' } });
  const command = {
    category: 'moderation',
    abuseProtection: {
      maxAttempts: 1,
      windowMs: 60_000,
      anomaly: {
        threshold: 3,
        windowMs: 60_000
      }
    }
  };

  const warnLogs = [];
  const originalWarn = logger.warn;
  logger.warn = (message, meta) => {
    warnLogs.push({ message, meta });
  };

  try {
    await enforceAbuseProtection(interaction, command, 'ban');
    await enforceAbuseProtection(interaction, command, 'ban');
    await enforceAbuseProtection(interaction, command, 'ban');
    await enforceAbuseProtection(interaction, command, 'ban');

    const anomalyLog = warnLogs.find((entry) => entry.meta?.event === 'interaction.command.abuse_anomaly');
    assert.ok(anomalyLog, 'expected anomaly log event after repeated blocked attempts');
    assert.equal(anomalyLog.meta.command, 'ban');
  } finally {
    logger.warn = originalWarn;
  }
});

test('formats cooldown duration for user-facing messaging', () => {
  assert.equal(formatCooldownDuration(500), '1s');
  assert.equal(formatCooldownDuration(61_000), '1m 1s');
});
