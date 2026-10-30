import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { handleEveryoneMention } from '../src/services/everyoneMentionGuardService.js';

describe('@everyone guard', () => {
  test('never deletes this bot\'s own @everyone ping', async () => {
    let deleted = false;
    const message = {
      content: '@everyone',
      mentions: { everyone: true },
      author: { id: 'bot', bot: true },
      client: { user: { id: 'bot' } },
      guild: { id: 'g' },
      delete: async () => { deleted = true; },
      channel: { send: async () => null },
    };
    assert.equal(await handleEveryoneMention(message), false);
    assert.equal(deleted, false);
  });
});
