import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COMMAND_CHANNEL_GUILD_ID,
  COMMAND_CHANNELS,
  enforceCommandChannel,
  resolveCommandDestination,
} from '../src/services/commandChannelPolicy.js';
import { OWNER_INBOX_USER_ID } from '../src/services/ownerInboxService.js';

const command = (name, category) => ({ data: { name }, category });
const client = ticket => ({ db: { get: async () => ticket } });

test('every command category resolves to a dedicated channel destination', () => {
  assert.equal(resolveCommandDestination(command('leaderboard', 'levels')), 'rankings');
  assert.equal(resolveCommandDestination(command('suggest', 'community')), 'suggestions');
  assert.equal(resolveCommandDestination(command('report', 'community')), 'reports');
  assert.equal(resolveCommandDestination(command('selfpromo', 'community')), 'selfPromotion');
  assert.equal(resolveCommandDestination(command('lookingforeditor', 'community')), 'lookingForEditor');
  assert.equal(resolveCommandDestination(command('lookingforteam', 'community')), 'lookingForTeam');
  assert.equal(resolveCommandDestination(command('editingtype', 'community')), 'roles');
  assert.equal(resolveCommandDestination(command('contest', 'contests')), 'contests');
  assert.equal(resolveCommandDestination(command('settings', 'admin')), 'settings');
  assert.equal(resolveCommandDestination(command('ban', 'moderation')), 'moderation');
  assert.equal(resolveCommandDestination(command('ping', 'general')), 'commands');
});

test('non-owner receives a private redirect in the wrong channel', async () => {
  let reply;
  const allowed = await enforceCommandChannel({
    user: { id: 'member-1' },
    guildId: COMMAND_CHANNEL_GUILD_ID,
    channelId: 'wrong-channel',
    reply: async payload => { reply = payload; },
  }, command('leaderboard', 'levels'), client(null));

  assert.equal(allowed, false);
  assert.equal(reply.flags, 64);
  assert.match(reply.content, new RegExp(COMMAND_CHANNELS.rankings));
  assert.deepEqual(reply.allowedMentions, { parse: [] });
});

test('owner bypasses the channel restriction', async () => {
  const allowed = await enforceCommandChannel({
    user: { id: OWNER_INBOX_USER_ID },
    guildId: COMMAND_CHANNEL_GUILD_ID,
    channelId: 'any-channel',
  }, command('leaderboard', 'levels'), client(null));
  assert.equal(allowed, true);
});

test('ticket commands work in the ticket panel and actual ticket channels', async () => {
  const base = { user: { id: 'member-1' }, guildId: COMMAND_CHANNEL_GUILD_ID };
  assert.equal(await enforceCommandChannel({
    ...base,
    channelId: COMMAND_CHANNELS.tickets,
  }, command('close', 'tickets'), client(null)), true);
  assert.equal(await enforceCommandChannel({
    ...base,
    channelId: 'active-ticket-channel',
  }, command('close', 'tickets'), client({ id: 'ticket-1' })), true);
});

test('other servers keep their existing command behavior', async () => {
  const allowed = await enforceCommandChannel({
    user: { id: 'member-1' },
    guildId: 'other-guild',
    channelId: 'any-channel',
  }, command('ping', 'general'), client(null));
  assert.equal(allowed, true);
});
