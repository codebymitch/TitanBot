import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { HOME_GUILD_ID } from '../src/config/homeGuild.js';
import { publishHoneypotNotice, buildHoneypotNotice, HONEYPOT_CHANNEL_NAME } from '../src/services/security/honeypotNotice.js';

function setup(guildId = HOME_GUILD_ID) {
  const store = new Map();
  const messages = new Map();
  const db = { get: async (key, fallback) => (store.has(key) ? store.get(key) : fallback), set: async (key, value) => { store.set(key, value); return true; } };
  const client = { user: { id: 'bot' }, db, guilds: { cache: new Map() } };
  const guild = { id: guildId, client };
  let nextId = 1;
  const channel = {
    name: HONEYPOT_CHANNEL_NAME, client, guild, isTextBased: () => true, sent: 0,
    send: async (payload) => {
      channel.sent += 1;
      const message = { id: String(nextId++), author: { id: 'bot' }, embeds: payload.embeds, pinned: false, pin: async () => { message.pinned = true; }, edit: async (next) => { message.embeds = next.embeds; message.edited = true; } };
      messages.set(message.id, message);
      return message;
    },
    messages: { fetch: async (arg) => (typeof arg === 'string' ? messages.get(arg) || null : new Map(messages)) },
  };
  guild.channels = { cache: { find: (fn) => [channel].find(fn) } };
  client.guilds.cache.set(guildId, guild);
  return { client, channel, messages };
}

describe('#dont-type-here notice (owner\'s request)', () => {
  test('posted and pinned once, then edited in place', async () => {
    const { client, channel, messages } = setup();
    assert.equal((await publishHoneypotNotice(client)).status, 'sent');
    const [message] = messages.values();
    assert.equal(message.pinned, true);
    assert.match(message.embeds[0].title, /ممنوع الكتابة/u);
    assert.equal((await publishHoneypotNotice(client)).status, 'updated');
    assert.equal(channel.sent, 1);
    assert.match(buildHoneypotNotice().description, /بان/u);
  });

  test('another server: nothing is posted', async () => {
    const { client, channel } = setup('100000000000000099');
    assert.equal((await publishHoneypotNotice(client)).status, 'skipped');
    assert.equal(channel.sent, 0);
  });
});
