import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { HOME_GUILD_ID } from '../src/config/homeGuild.js';
import { CLOVER_BOT_ID } from '../src/config/games.js';
import messageUpdate, { resolveEditedMessage } from '../src/events/messageUpdate.js';

function spyClient() {
  const lookups = [];
  return { lookups, guilds: { cache: { get: (id) => { lookups.push(id); return null; } }, fetch: async () => null }, db: { get: async (key, fallback) => fallback, set: async () => true } };
}

function partialEdit(guildId, full) {
  return { partial: true, id: '900000000000000001', guild: { id: guildId }, guildId, author: null, content: null, fetch: async () => full };
}

describe('game messages edited by a bot are not logged as edits', () => {
  test('in our server a partial edit is fetched first, and a games bot edit is not logged', async () => {
    const client = spyClient();
    const clover = { partial: false, id: '900000000000000001', guild: { id: HOME_GUILD_ID }, author: { id: CLOVER_BOT_ID, bot: true }, content: '', embeds: [], components: [], client, mentions: { users: new Map() } };
    assert.equal(await resolveEditedMessage(partialEdit(HOME_GUILD_ID, clover)), clover);
    await messageUpdate.execute({ content: null }, partialEdit(HOME_GUILD_ID, clover));
    assert.deepEqual(client.lookups, []);

    // An edit whose author can't be known is not logged either.
    const unknown = partialEdit(HOME_GUILD_ID, null);
    assert.equal(await resolveEditedMessage(unknown), null);
    await messageUpdate.execute({ content: null }, unknown);
    assert.deepEqual(client.lookups, []);
  });

  test('another server keeps the old behaviour', async () => {
    const client = spyClient();
    const other = '100000000000000099';
    const edit = { ...partialEdit(other, null), client, channel: { id: 'c', name: 'chat', toString: () => '<#c>' }, createdTimestamp: Date.now() };
    assert.equal(await resolveEditedMessage(edit), edit);
    await messageUpdate.execute({ content: 'old' }, edit);
    assert.deepEqual(client.lookups, [other]);
  });
});
