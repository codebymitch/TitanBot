import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { HOME_GUILD_ID } from '../src/config/homeGuild.js';
import { SERVERS_BOARD_CHANNEL_ID, buildServersBoard, isServersBoard, publishServersBoard } from '../src/services/serversBoard.js';

const BOT_ID = '999999999999999999';

function fakeClient(guildId) {
  const messages = [];
  const config = new Map();
  const channel = {
    id: SERVERS_BOARD_CHANNEL_ID,
    guild: { id: guildId },
    isTextBased: () => true,
    messages: {
      fetch: async (arg) => (typeof arg === 'string' ? messages.find((m) => m.id === arg) || null : new Map(messages.map((m) => [m.id, m]))),
    },
    send: async (payload) => {
      const m = { id: `m${messages.length + 1}`, author: { id: BOT_ID }, embeds: payload.embeds, createdTimestamp: messages.length, delete: async () => {}, edit: async function (p) { this.embeds = p.embeds; } };
      messages.push(m);
      return m;
    },
  };
  channel.client = {
    user: { id: BOT_ID },
    db: { get: async (k, f) => (config.has(k) ? config.get(k) : f), set: async (k, v) => { config.set(k, v); return true; } },
    guilds: { cache: new Map([['1', { id: '1', name: 'A', memberCount: 5 }], ['2', { id: '2', name: 'B', memberCount: 9 }]]) },
    channels: { fetch: async (id) => (id === SERVERS_BOARD_CHANNEL_ID ? channel : null) },
  };
  return { client: channel.client, messages };
}

describe('servers board', () => {
  test('builds an embed with the server count and the live footer', () => {
    const { client } = fakeClient(HOME_GUILD_ID);
    const embed = buildServersBoard(client);
    assert.match(embed.title, /2 سيرفر/);
    assert.ok(embed.description.indexOf('B') < embed.description.indexOf('A'));
    assert.ok(isServersBoard({ embeds: [embed] }));
  });

  test('sends once, then edits the same post', async () => {
    const { client, messages } = fakeClient(HOME_GUILD_ID);
    assert.equal((await publishServersBoard(client)).status, 'sent');
    client.guilds.cache.set('3', { id: '3', name: 'C', memberCount: 1 });
    assert.equal((await publishServersBoard(client)).status, 'updated');
    assert.equal(messages.length, 1);
    assert.match(messages[0].embeds[0].title, /3 سيرفر/);
  });

  test('a channel in another server is left alone', async () => {
    const { client, messages } = fakeClient('555');
    assert.equal((await publishServersBoard(client)).status, 'no-channel');
    assert.equal(messages.length, 0);
  });
});
