import test from 'node:test';
import assert from 'node:assert/strict';
import { PermissionFlagsBits } from 'discord.js';
import stickyCommand from '../src/commands/moderation/sticky.js';
import {
  getStickyMessage,
  publishStickyMessage,
  removeStickyMessage,
  saveStickyMessage,
  scheduleStickyRefresh,
  STICKY_MESSAGE_INTERVAL,
} from '../src/services/stickyMessageService.js';

function memoryClient() {
  const values = new Map();
  return {
    values,
    db: {
      get: async (key, fallback) => values.get(key) ?? fallback,
      set: async (key, value) => {
        values.set(key, value);
        return true;
      },
      delete: async key => values.delete(key),
    },
  };
}

test('/sticky exposes set, view and remove to Manage Messages members', () => {
  const data = stickyCommand.data.toJSON();
  assert.equal(data.name, 'sticky');
  assert.equal(data.default_member_permissions, PermissionFlagsBits.ManageMessages.toString());
  assert.deepEqual(data.options.map(option => option.name), ['set', 'view', 'remove']);
  assert.equal(data.options[0].options.find(option => option.name === 'message').max_length, 2000);
});

test('sticky messages persist, replace the previous bot message and disable mentions', async () => {
  const client = memoryClient();
  let previousDeleted = false;
  const sent = [];
  const channel = {
    id: 'channel-1',
    guildId: 'guild-1',
    isTextBased: () => true,
    messages: {
      fetch: async id => id === 'old-message'
        ? { delete: async () => { previousDeleted = true; } }
        : null,
    },
    send: async payload => {
      sent.push(payload);
      return { id: 'new-message' };
    },
  };
  await saveStickyMessage(client, 'guild-1', 'channel-1', {
    content: 'Please read @everyone',
    lastMessageId: 'old-message',
  });

  await publishStickyMessage(client, channel, await getStickyMessage(client, 'guild-1', 'channel-1'));

  assert.equal(previousDeleted, true);
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].allowedMentions, { parse: [], users: [], roles: [] });
  assert.match(sent[0].embeds[0].data.description, /@everyone/);
  assert.equal((await getStickyMessage(client, 'guild-1', 'channel-1')).lastMessageId, 'new-message');

  const removed = await removeStickyMessage(client, 'guild-1', 'channel-1');
  assert.equal(removed.content, 'Please read @everyone');
  assert.equal(await getStickyMessage(client, 'guild-1', 'channel-1'), null);
});

test('sticky refreshes immediately on every fifth user message', async () => {
  const client = memoryClient();
  const sent = [];
  const channel = {
    id: 'channel-1',
    guildId: 'guild-1',
    isTextBased: () => true,
    messages: { fetch: async () => null },
    send: async payload => {
      sent.push(payload);
      return { id: `sticky-${sent.length}` };
    },
  };
  await saveStickyMessage(client, 'guild-1', 'channel-1', {
    content: 'Sticky',
    lastMessageId: 'initial-sticky',
    messagesSinceLastPost: 0,
  });
  const message = { client, guild: { id: 'guild-1' }, channel };

  for (let index = 1; index < STICKY_MESSAGE_INTERVAL; index += 1) {
    assert.equal(await scheduleStickyRefresh(message), false);
  }
  assert.equal(sent.length, 0);
  assert.equal(await scheduleStickyRefresh(message), true);
  assert.equal(sent.length, 1);
  assert.equal((await getStickyMessage(client, 'guild-1', 'channel-1')).messagesSinceLastPost, 0);
});

test('simultaneous messages are serialized and create only one sticky copy', async () => {
  const client = memoryClient();
  client.user = { id: 'bot-1' };
  const sent = [];
  const channel = {
    id: 'channel-race',
    guildId: 'guild-1',
    isTextBased: () => true,
    messages: { fetch: async () => null },
    send: async payload => {
      sent.push(payload);
      return { id: `sticky-${sent.length}` };
    },
  };
  await saveStickyMessage(client, 'guild-1', channel.id, {
    content: 'Sticky',
    lastMessageId: null,
    messagesSinceLastPost: 0,
  });
  const message = { client, guild: { id: 'guild-1' }, channel };

  await Promise.all(Array.from({ length: STICKY_MESSAGE_INTERVAL }, () => scheduleStickyRefresh(message)));

  assert.equal(sent.length, 1);
  assert.equal((await getStickyMessage(client, 'guild-1', channel.id)).messagesSinceLastPost, 0);
});
