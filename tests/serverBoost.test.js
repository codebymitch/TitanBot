import test from 'node:test';
import assert from 'node:assert/strict';
import { ChannelType, Collection } from 'discord.js';
import { BOOST_CHANNEL_NAME, BOOST_GUILD_ID, handleBoostStarted } from '../src/events/guildMemberUpdate.js';

function fixture({ oldPremium = null, newPremium = new Date('2026-07-16T12:00:00Z'), channel = true, permissions = true } = {}) {
  const stored = new Map(), sent = [];
  const boostChannel = { id: 'boosts', name: BOOST_CHANNEL_NAME, type: ChannelType.GuildText, permissionsFor: () => ({ has: () => permissions }), send: async payload => { sent.push(payload); } };
  const guild = { id: BOOST_GUILD_ID, premiumTier: 2, premiumSubscriptionCount: 7, members: { me: { id: 'bot' } }, channels: { cache: new Collection(channel ? [['boosts', boostChannel]] : []) } };
  const member = premiumSince => ({ id: 'user-1', guild, premiumSince, premiumSinceTimestamp: premiumSince?.getTime() ?? null, user: { toString: () => '<@user-1>' } });
  const client = { db: { isAvailable: () => true, get: async (key, fallback) => stored.get(key) ?? fallback, set: async (key, value) => { stored.set(key, value); }, delete: async key => stored.delete(key) } };
  return { oldMember: member(oldPremium), newMember: member(newPremium), client, stored, sent };
}

test('announces only a null-to-premiumSince boost transition', async () => {
  const started = fixture();
  assert.equal(await handleBoostStarted(started.oldMember, started.newMember, started.client), true);
  assert.equal(started.sent.length, 1);
  assert.equal(started.sent[0].content, '<@user-1>');
  assert.deepEqual(started.sent[0].allowedMentions, { parse: [], users: ['user-1'] });

  const unrelated = fixture({ oldPremium: new Date('2026-07-16T12:00:00Z') });
  assert.equal(await handleBoostStarted(unrelated.oldMember, unrelated.newMember, unrelated.client), false);
  assert.equal(unrelated.sent.length, 0);
});

test('persistent detection key prevents duplicate boost announcements', async () => {
  const input = fixture();
  assert.equal(await handleBoostStarted(input.oldMember, input.newMember, input.client), true);
  assert.equal(await handleBoostStarted(input.oldMember, input.newMember, input.client), false);
  assert.equal(input.sent.length, 1);
});

test('missing channel or permissions is handled without sending or throwing', async () => {
  const missing = fixture({ channel: false });
  assert.equal(await handleBoostStarted(missing.oldMember, missing.newMember, missing.client), false);
  const denied = fixture({ permissions: false });
  assert.equal(await handleBoostStarted(denied.oldMember, denied.newMember, denied.client), false);
  assert.equal(denied.sent.length, 0);
});
