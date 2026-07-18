import test from 'node:test';
import assert from 'node:assert/strict';
import messageCreate, { LEVEL_UP_CHANNEL_ID } from '../src/events/messageCreate.js';

test('level-up announcements use the dedicated channel and ping the member', async () => {
  const sent = [];
  const channel = {
    id: LEVEL_UP_CHANNEL_ID,
    isTextBased: () => true,
    send: async payload => {
      sent.push(payload);
      return payload;
    },
  };
  const author = {
    id: 'member-1',
    bot: false,
    toString: () => '<@member-1>',
  };
  const values = new Map([
    ['community:guild-1:config', {
      leveling: { enabled: true, cooldownMs: 0, xpMin: 1, xpMax: 1 },
    }],
    ['community:guild-1:level:member-1', { xp: 99, level: 0, last: 0 }],
  ]);
  const message = {
    author,
    content: 'level me up',
    guild: {
      id: 'guild-1',
      channels: {
        cache: new Map([[LEVEL_UP_CHANNEL_ID, channel]]),
        fetch: async () => {
          throw new Error('the cached channel should be used');
        },
      },
    },
    channel: {
      send: async () => {
        throw new Error('the source channel must not receive the announcement');
      },
    },
    client: {
      db: {
        get: async (key, fallback) => values.get(key) ?? fallback,
        set: async (key, value) => values.set(key, value),
      },
    },
    webhookId: null,
  };

  await messageCreate.execute(message);

  assert.equal(sent.length, 1);
  assert.equal(sent[0].content, '<@member-1>');
  assert.deepEqual(sent[0].allowedMentions, { users: ['member-1'], parse: [] });
  assert.match(sent[0].embeds[0].data.description, /<@member-1>/);
  assert.match(sent[0].embeds[0].data.description, /1/);
});
