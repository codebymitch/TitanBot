import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Events } from 'discord.js';
import registerServerLogging from '../src/handlers/serverLogging.js';

test('registers the logging listeners exactly once and without undefined event names', () => {
  const client = new EventEmitter();
  registerServerLogging(client);
  const firstNames = client.eventNames();
  assert.ok(firstNames.length >= 20);
  assert.ok(!firstNames.includes(undefined));
  for (const required of [Events.MessageUpdate, Events.MessageDelete, Events.GuildMemberRemove, Events.ChannelUpdate, Events.GuildRoleUpdate, Events.VoiceStateUpdate, Events.InviteCreate, Events.GuildEmojiCreate, Events.GuildStickerUpdate, Events.GuildUpdate]) assert.ok(firstNames.includes(required));
  const counts = new Map(firstNames.map(name => [name, client.listenerCount(name)]));
  registerServerLogging(client);
  for (const [name, count] of counts) assert.equal(client.listenerCount(name), count);
});
