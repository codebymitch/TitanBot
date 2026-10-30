import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { PermissionsBitField, PermissionFlagsBits } from 'discord.js';
import { LEVEL_TIERS, findLevelTierRoles } from '../src/services/leveling/levelTierRoles.js';
import { getLevelingConfig } from '../src/services/leveling/leveling.js';
import { ROLE_DEFINITIONS } from '../src/services/staffRoleHierarchyService.js';
import { buildSavedIdeasEmbed, isSavedIdeasBoard } from '../src/services/savedIdeasBoardService.js';
import { SAVED_IDEAS } from '../src/config/savedIdeas.js';

// A guild whose roles throw on any change: the bot must only read them.
function mockGuild(initial) {
  const cache = new Map();
  for (const { id, name, position } of initial) {
    cache.set(id, {
      id, name, position, managed: false, editable: true, color: 0,
      edit: async () => { throw new Error('must not edit'); },
      delete: async () => { throw new Error('must not delete'); },
      setPosition: async () => { throw new Error('must not move'); },
    });
  }
  return {
    id: 'g-tiers', name: 'test',
    members: { me: { permissions: new PermissionsBitField([PermissionFlagsBits.ManageRoles]) } },
    roles: { cache, fetch: async () => cache, create: async () => { throw new Error('must not create'); } },
  };
}

const store = new Map();
const client = { db: { get: async (key, fallback) => (store.has(key) ? store.get(key) : fallback), set: async (key, value) => store.set(key, value) } };

describe('level roles', () => {
  test('emojis and colours are different from the staff roles', () => {
    const staffEmojis = ROLE_DEFINITIONS.map((definition) => definition.name.split(' ')[0]);
    const staffColors = ROLE_DEFINITIONS.map((definition) => definition.color.toLowerCase());
    for (const tier of LEVEL_TIERS) {
      assert.ok(!staffEmojis.includes(tier.name.split(' ')[0]), `${tier.name} uses a staff emoji`);
      assert.ok(!staffColors.includes(tier.color.toLowerCase()), `${tier.name} uses a staff colour`);
    }
    assert.equal(new Set(LEVEL_TIERS.map((tier) => tier.name.split(' ')[0])).size, LEVEL_TIERS.length);
    assert.deepEqual(LEVEL_TIERS.map((tier) => tier.level), [...LEVEL_TIERS.map((tier) => tier.level)].sort((a, b) => a - b));
  });

  test('saves the level roles that exist as rewards and never creates the missing ones', async () => {
    const [first, second, ...rest] = LEVEL_TIERS;
    const guild = mockGuild([
      { id: '100000000000000000', name: '@everyone', position: 0 },
      { id: '100000000000000001', name: first.name, position: 1 },
      { id: '100000000000000002', name: second.name, position: 2 },
    ]);
    const summary = await findLevelTierRoles(client, guild);
    assert.deepEqual(summary, { found: 2, missing: rest.map((tier) => tier.name), rewardsSaved: true });
    const rewards = (await getLevelingConfig(client, guild.id)).roleRewards;
    assert.equal(rewards[first.level], '100000000000000001');
    assert.equal(rewards[second.level], '100000000000000002');
    assert.equal(guild.roles.cache.size, 3);

    // The owner renames a level role: it is still found by its saved ID. A second startup changes nothing.
    guild.roles.cache.get('100000000000000001').name = 'Legend';
    assert.deepEqual(await findLevelTierRoles(client, guild), { found: 2, missing: rest.map((tier) => tier.name), rewardsSaved: false });
  });
});

describe('saved ideas in the trusted channel', () => {
  test('lists every saved idea and is told apart from the trusted board', () => {
    const embed = buildSavedIdeasEmbed();
    assert.equal(embed.fields.length, SAVED_IDEAS.length);
    assert.ok(embed.fields[0].name.startsWith('1. '));
    assert.equal(isSavedIdeasBoard({ embeds: [embed] }), true);
    assert.equal(isSavedIdeasBoard({ embeds: [{ title: 'Trusted' }] }), false);
  });
});
