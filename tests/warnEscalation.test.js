import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { getWarnTimeoutMs, getNextTimeoutThreshold, warningCard } from '../src/services/moderation/warnEscalation.js';
import { moderationCardText, cardReason, formatDurationMs, CARD_DIVIDER, NO_REASON } from '../src/utils/moderationCard.js';

const MINUTE = 60_000;

describe('warn escalation', () => {
  test('no timeout below 3 warnings or between multiples of 3', () => {
    for (const count of [0, 1, 2, 4, 5, 7, 8]) assert.equal(getWarnTimeoutMs(count), 0, `count ${count}`);
  });

  test('15m at 3, then doubles every 3 warnings', () => {
    assert.equal(getWarnTimeoutMs(3), 15 * MINUTE);
    assert.equal(getWarnTimeoutMs(6), 30 * MINUTE);
    assert.equal(getWarnTimeoutMs(9), 60 * MINUTE);
    assert.equal(getWarnTimeoutMs(12), 120 * MINUTE);
  });

  test('never exceeds the 28 day Discord limit', () => {
    assert.equal(getWarnTimeoutMs(300), 28 * 24 * 60 * MINUTE);
  });

  test('next threshold is the next multiple of 3', () => {
    assert.equal(getNextTimeoutThreshold(0), 3);
    assert.equal(getNextTimeoutThreshold(1), 3);
    assert.equal(getNextTimeoutThreshold(3), 3);
    assert.equal(getNextTimeoutThreshold(4), 6);
    assert.equal(getNextTimeoutThreshold(7), 9);
  });
});

describe('moderation card', () => {
  test('follows the WARNING ISSUED layout', () => {
    const text = moderationCardText({
      emoji: '⚠️',
      title: 'WARNING ISSUED',
      fields: [['User', '<@1>'], ['Reason', 'Spam'], ['Warnings', '3/3'], ['Punishment', null]],
      moderatorId: '2',
      timestamp: 1_700_000_000_000,
    });
    assert.equal(text, [
      '⚠️ **WARNING ISSUED**',
      '',
      '**User:** <@1>',
      '**Reason:** Spam',
      '**Warnings:** 3/3',
      CARD_DIVIDER,
      '**Moderator:** <@2>',
      '**Time:** <t:1700000000:R>',
    ].join('\n'));
  });

  test('warning card shows the auto timeout', () => {
    const payload = warningCard({
      userId: '1',
      moderatorId: '2',
      result: { reason: 'Spam', totalCount: 6, timeoutMs: 30 * MINUTE, timeoutApplied: true },
    });
    assert.match(payload.content, /\*\*Warnings:\*\* 6\/6/);
    assert.match(payload.content, /\*\*Punishment:\*\* ⏳ Timeout 30m/);
    assert.deepEqual(payload.allowedMentions, { parse: [] });
  });

  test('default reasons become the Arabic placeholder', () => {
    assert.equal(cardReason('No reason provided'), NO_REASON);
    assert.equal(cardReason(''), NO_REASON);
    assert.equal(cardReason('  سبام \n كثير '), 'سبام كثير');
  });

  test('durations use the largest even unit', () => {
    assert.equal(formatDurationMs(15 * MINUTE), '15m');
    assert.equal(formatDurationMs(60 * MINUTE), '1h');
    assert.equal(formatDurationMs(1440 * MINUTE), '1d');
    assert.equal(formatDurationMs(10080 * MINUTE), '1w');
  });
});
