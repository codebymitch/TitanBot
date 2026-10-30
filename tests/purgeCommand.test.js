import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { HOME_GUILD_ID } from '../src/config/homeGuild.js';
import { handlePurgeMessage, parsePurgeArgs, purgeChannel } from '../src/services/moderation/channelPurgeService.js';

const OWNER = '1159601661392715906';
const STRANGER = '200000000000000003';

function setup({ guildId = HOME_GUILD_ID, authorId = OWNER, messages = 250 } = {}) {
  const sent = [];
  const bulk = [];
  let remaining = messages;
  const channel = {
    id: '500000000000000001',
    isTextBased: () => true,
    messages: {
      fetch: async ({ limit }) => {
        const size = Math.min(limit, remaining);
        return new Map(Array.from({ length: size }, (_, i) => [String(i), {}]));
      },
    },
    bulkDelete: async (batch) => {
      remaining -= batch.size;
      bulk.push(batch.size);
      return { size: batch.size };
    },
    send: async (payload) => { sent.push(payload); return { delete: async () => {} }; },
  };
  const message = {
    guild: { id: guildId }, client: {}, author: { id: authorId, tag: 'owner#1' }, channel,
    deleted: false, delete: async () => { message.deleted = true; },
  };
  return { message, channel, sent, bulk, left: () => remaining };
}

describe('purge with a count and a confirm word', () => {
  test('arguments: a count 1-1000 and the word, in any order; anything else is refused', () => {
    assert.deepEqual(parsePurgeArgs([]), { limit: null, confirmed: false });
    assert.deepEqual(parsePurgeArgs(['50']), { limit: 50, confirmed: false });
    assert.deepEqual(parsePurgeArgs(['50', 'تأكيد']), { limit: 50, confirmed: true });
    assert.deepEqual(parsePurgeArgs(['تاكيد', '7']), { limit: 7, confirmed: true });
    assert.deepEqual(parsePurgeArgs(['تأكيد']), { limit: null, confirmed: true });
    for (const bad of [['0'], ['5000'], ['abc'], ['5', '6']]) assert.equal(parsePurgeArgs(bad), null);
  });

  test('purgeChannel deletes only the latest N messages', async () => {
    const { channel, left } = setup();
    assert.equal(await purgeChannel(channel, 130), 130);
    assert.equal(left(), 120);
  });

  test('`purge 50 تأكيد` deletes right away: no confirmation message, the command goes first', async () => {
    const { message, sent, left } = setup();
    await handlePurgeMessage(message, ['50', 'تأكيد']);
    assert.equal(message.deleted, true);
    assert.equal(left(), 200);
    assert.equal(sent.length, 1);
    assert.match(sent[0].content, /المحذوفة: \*\*50\*\*/u);
    assert.equal(sent[0].components, undefined);
  });

  test('`purge 50` asks for Confirm and puts the count in the button; plain `purge` is as before', async () => {
    const counted = setup();
    await handlePurgeMessage(counted.message, ['50']);
    assert.equal(counted.left(), 250);
    assert.match(counted.sent[0].content, /آخر \*\*50\*\* رسالة/u);
    assert.match(counted.sent[0].components[0].components[0].data.custom_id, /^purge_confirm:\d+:\d+:50$/u);

    const plain = setup();
    await handlePurgeMessage(plain.message, []);
    assert.doesNotMatch(plain.sent[0].components[0].components[0].data.custom_id, /:50$/u);
    assert.equal(plain.left(), 250);
  });

  test('only the owner, and another server keeps the old behaviour', async () => {
    const stranger = setup({ authorId: STRANGER });
    await handlePurgeMessage(stranger.message, ['50', 'تأكيد']);
    assert.equal(stranger.left(), 250);
    assert.match(stranger.sent[0], /Owner Only/u);

    const other = setup({ guildId: '300000000000000001' });
    await handlePurgeMessage(other.message, ['50', 'تأكيد']);
    assert.equal(other.left(), 250, 'nothing is deleted without the button');
    assert.equal(other.message.deleted, false);
    assert.ok(other.sent[0].components);
  });

  test('a bad count gets a short hint and deletes nothing', async () => {
    const { message, sent, left } = setup();
    await handlePurgeMessage(message, ['5000', 'تأكيد']);
    assert.equal(left(), 250);
    assert.match(sent[0], /الاستخدام/u);
  });
});
