import test from 'node:test';
import assert from 'node:assert/strict';
import { Collection } from 'discord.js';
import { AccessLevel, memberAccessLevel } from '../src/modules/community/permissions.js';
import { levelCommand } from '../src/commands/levels/factory.js';

const clientWithConfig = config => ({ db: { get: async () => config } });
const memberInteraction = (roles = []) => ({
  guildId: 'guild-1', guild: { ownerId: 'owner' }, user: { id: 'member' }, inGuild: () => true,
  member: { roles: { cache: new Collection(roles.map(id => [id, { id }])) }, permissions: { has: () => false } }
});

test('members receive verified access when verification is disabled or unconfigured', async () => {
  assert.equal(await memberAccessLevel(memberInteraction(), clientWithConfig({ verification: { enabled: false, roleId: null } })), AccessLevel.VERIFIED);
  assert.equal(await memberAccessLevel(memberInteraction(), clientWithConfig({ verification: { enabled: true, roleId: null } })), AccessLevel.VERIFIED);
});

test('configured verification still requires the configured role', async () => {
  const config = { verification: { enabled: true, roleId: 'verified' } };
  assert.equal(await memberAccessLevel(memberInteraction(), clientWithConfig(config)), AccessLevel.EVERYONE);
  assert.equal(await memberAccessLevel(memberInteraction(['verified']), clientWithConfig(config)), AccessLevel.VERIFIED);
});

test('leaderboard is available to every server member', async () => {
  let reply;
  const client = { db: { get: async () => ({ verification: { enabled: true, roleId: 'verified' } }), list: async () => [] } };
  const interaction = { ...memberInteraction(), commandName: 'leaderboard', reply: async payload => { reply = payload; } };
  await levelCommand('leaderboard').execute(interaction, client);
  assert.match(reply.embeds[0].data.title, /מובילים/);
});
