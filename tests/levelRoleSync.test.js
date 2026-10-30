import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { levelRoleChanges, syncMemberLevelRoles } from '../src/services/leveling/levelRoleSyncService.js';

const rewards = { 5: 'r5', 10: 'r10', 15: 'r15', 20: 'r20' };

function mockMember(held = []) {
  const cache = new Map(held.map((id) => [id, { id }]));
  return {
    id: 'm1',
    roles: {
      cache,
      add: async (role) => { cache.set(role.id, role); },
      remove: async (role) => { cache.delete(role.id); },
    },
  };
}

const guild = {
  id: 'g1',
  roles: { cache: new Map(Object.values(rewards).map((id) => [id, { id }])), fetch: async () => null },
};

describe('level roles are given automatically', () => {
  test('a member gets only the role of the highest level they reached', () => {
    const { add, remove } = levelRoleChanges(12, rewards, new Set(['r5']));
    assert.deepEqual(add.map((entry) => entry.roleId), ['r10']);
    assert.deepEqual(remove.map((entry) => entry.roleId), ['r5']);
  });

  test('roles above the level are only removed when asked', () => {
    assert.deepEqual(levelRoleChanges(7, rewards, new Set(['r5', 'r15'])).remove, []);
    assert.deepEqual(levelRoleChanges(7, rewards, new Set(['r5', 'r15']), { removeAbove: true }).remove.map((entry) => entry.roleId), ['r15']);
  });

  test('reaching level 10 swaps Level 5 for Level 10 and leaves media alone', async () => {
    const member = mockMember(['r5', 'media']);
    const { added, removed } = await syncMemberLevelRoles(guild, member, 10, rewards);
    assert.deepEqual(added, ['r10']);
    assert.deepEqual(removed, ['r5']);
    assert.deepEqual([...member.roles.cache.keys()].sort(), ['media', 'r10']);
  });

  test('a media role is never taken away, even when it is set as a reward', async () => {
    const withMedia = { id: 'g1', roles: { cache: new Map([...guild.roles.cache, ['media', { id: 'media', name: 'media' }]]), fetch: async () => null } };
    const member = mockMember(['media']);
    await syncMemberLevelRoles(withMedia, member, 10, { ...rewards, 3: 'media' });
    assert.ok(member.roles.cache.has('media'));
    assert.ok(member.roles.cache.has('r10'));
  });

  test('lowering the level takes the higher roles away and gives back the right one', async () => {
    const member = mockMember(['r5', 'r10', 'r15', 'r20']);
    const { removed } = await syncMemberLevelRoles(guild, member, 11, rewards, { removeAbove: true });
    assert.deepEqual(removed, ['r5', 'r15', 'r20']);
    assert.deepEqual([...member.roles.cache.keys()], ['r10']);
  });

  test('if the new role is missing, the old one is kept', async () => {
    const member = mockMember(['r5']);
    const { added, removed } = await syncMemberLevelRoles(guild, member, 10, { 5: 'r5', 10: 'gone' });
    assert.deepEqual(added, []);
    assert.deepEqual(removed, []);
    assert.ok(member.roles.cache.has('r5'));
  });
  test('a missing lower role does not stop the current one', async () => {
    const member = mockMember();
    const { added } = await syncMemberLevelRoles(guild, member, 10, { 5: 'gone', 10: 'r10' });
    assert.deepEqual(added, ['r10']);
  });
});
