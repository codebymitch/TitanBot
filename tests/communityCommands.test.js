import assert from 'node:assert/strict';
import test from 'node:test';
import { Collection } from 'discord.js';
import { communityCommand, createModal, parseDuration } from '../src/commands/community/factory.js';
import settings from '../src/commands/admin/settings.js';
import communityActions from '../src/modules/interactions/buttons/community_actions.js';
import communityModal from '../src/modules/interactions/modals/community_form.js';

const names = ['suggest', 'feedback', 'report', 'poll', 'selfpromo', 'lookingforeditor', 'lookingforteam', 'editingtype'];

test('all community commands build as unique guild-only slash commands', () => {
  const commands = names.map(name => communityCommand(name).data.toJSON());
  assert.equal(new Set(commands.map(command => command.name)).size, names.length);
  for (const command of commands) {
    assert.equal(command.dm_permission, false);
    assert.match(command.description, /[\u0590-\u05ff]/);
  }
  assert.equal(commands.find(command => command.name === 'poll').options.length, 8);
});

test('community modal definitions stay within Discord limits', () => {
  for (const name of names.filter(name => !['poll', 'editingtype'].includes(name))) {
    const modal = createModal(name).toJSON();
    assert.ok(modal.components.length >= 2 && modal.components.length <= 5);
    assert.ok(modal.components.every(row => row.components.length === 1));
  }
  assert.equal(communityModal.name, 'community_form');
  assert.equal(communityActions.length, 5);
  assert.deepEqual(communityActions.map(handler => handler.name), ['community_vote', 'community_status', 'community_interest', 'community_contact', 'community_close']);
});

test('poll duration validation enforces ten minutes through seven days', () => {
  assert.equal(parseDuration('10m'), 600000);
  assert.equal(parseDuration('2h'), 7200000);
  assert.equal(parseDuration('7d'), 604800000);
  for (const invalid of ['9m', '8d', '1 hour', '', 'abc']) assert.equal(parseDuration(invalid), null);
});

test('settings exposes the complete community configuration group', () => {
  const json = settings.data.toJSON();
  const group = json.options.find(option => option.name === 'community');
  assert.ok(group);
  assert.deepEqual(group.options.map(option => option.name), ['view', 'channel', 'cooldown', 'toggles', 'roles']);
  const channel = group.options.find(option => option.name === 'channel');
  assert.equal(channel.options.find(option => option.name === 'type').choices.length, 6);
});

test('duplicate suggestion votes are rejected and persisted votes remain addressable after reload', async () => {
  const records = new Map([['community:g:suggest:1', { id: '1', status: 'open', votes: { u: 'up' } }]]);
  const client = { db: { get: async key => records.get(key), set: async (key, value) => records.set(key, value) } };
  let reply;
  const interaction = { guildId: 'g', user: { id: 'u' }, reply: async payload => { reply = payload; } };
  await communityActions[0].execute(interaction, client, ['suggest', '1', 'up']);
  assert.match(reply.content, /כבר הצבעת/);
  assert.equal(records.get('community:g:suggest:1').votes.u, 'up');
});

test('missing configured channel keeps report submission private and sends no message', async () => {
  const client = { db: { get: async key => key.endsWith(':config') ? {} : 0 } };
  let reply;
  const interaction = {
    guildId: 'g', guild: { channels: { cache: new Collection() } },
    reply: async payload => { reply = payload; }
  };
  await communityModal.execute(interaction, client, ['report']);
  assert.equal(reply.content, 'ערוץ המערכת עדיין לא הוגדר.');
  assert.ok(reply.flags);
});
