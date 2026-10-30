import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { cardReason, NO_REASON } from '../src/utils/moderationCard.js';
import { mapArgumentsToOptions } from '../src/utils/prefixParser.js';

describe('commands without a written reason', () => {
  test('a missing or blank reason means no reason was given', () => {
    for (const value of [undefined, null, '', '   ', '\n']) assert.equal(cardReason(value), NO_REASON);
  });

  test('old English defaults also mean no reason was given', () => {
    for (const value of ['No reason provided', 'Mass ban - No reason provided', 'Mass kick - No reason provided']) {
      assert.equal(cardReason(value), NO_REASON);
    }
  });

  test('a written reason is kept', () => {
    assert.equal(cardReason('سبام كتير'), 'سبام كتير');
  });

  test('warn runs without a reason', async () => {
    const { default: warn } = await import('../src/commands/Moderation/warn.js');
    const options = mapArgumentsToOptions(['<@111111111111111111>'], warn.data);
    assert.equal(options.validateRequired().valid, true);
    assert.equal(cardReason(options.getString('reason')), NO_REASON);
  });
});
