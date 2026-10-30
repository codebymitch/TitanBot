import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { PermissionFlagsBits, PermissionsBitField } from 'discord.js';
import '../src/utils/embeds.js';
import { ROLE_DEFINITIONS, rememberStaffRoles, demoteAdministratorsBelowAdmin } from '../src/services/staffRoleHierarchyService.js';
import { HOME_GUILD_ID } from '../src/config/homeGuild.js';
import { memberHasModerationCommandAccess } from '../src/utils/permissionGuard.js';

const permissionsOf = (name) => new PermissionsBitField(ROLE_DEFINITIONS.find((definition) => definition.name === name).permissions);
const VOICE = [PermissionFlagsBits.MoveMembers, PermissionFlagsBits.MuteMembers, PermissionFlagsBits.DeafenMembers, PermissionFlagsBits.ModerateMembers];

describe('staff role permissions', () => {
  test('hierarchy order, highest first', () => {
    assert.deepEqual(ROLE_DEFINITIONS.map((definition) => definition.name), [
      '👑 Owner', '⚡ Head Admin', '🛡️ Admin', '🎖️ Supervisor', '⚔️ Senior Moderator',
      '🔨 Moderator', '💬 Chat Moderator', '🎧 Voice Moderator', '🔰 Trial Moderator', '🎫 Support Staff',
    ]);
  });

  for (const name of ['👑 Owner', '⚡ Head Admin', '🛡️ Admin']) {
    test(`${name} is Administrator`, () => {
      assert.ok(permissionsOf(name).has(PermissionFlagsBits.Administrator, false));
    });
  }

  // Report #208: below 🛡️ Admin, every permission but Administrator.
  for (const name of ['🎖️ Supervisor', '⚔️ Senior Moderator', '🔨 Moderator']) {
    test(`${name} has every permission except Administrator`, () => {
      const permissions = permissionsOf(name);
      assert.equal(permissions.has(PermissionFlagsBits.Administrator, false), false);
      assert.equal(permissions.bitfield | PermissionFlagsBits.Administrator, PermissionsBitField.All);
    });
  }

  test('once, in our server: roles below Admin with Administrator get every permission but it', async () => {
    const make = (id, name, position, permissions, managed = false) => {
      const role = { id, name, position, managed, permissions: new PermissionsBitField(permissions), setPermissions: async (bits) => { role.permissions = new PermissionsBitField(bits); return role; } };
      return role;
    };
    const roles = [
      make('1', '⚡ Head Admin', 9, PermissionFlagsBits.Administrator),
      make('2', '🛡️ Admin', 8, PermissionFlagsBits.Administrator),
      make('3', '🎖️ Supervisor', 7, PermissionFlagsBits.Administrator),
      make('4', 'Old helpers', 3, PermissionFlagsBits.Administrator),
      make('5', 'Members', 1, PermissionFlagsBits.SendMessages),
      make('6', 'SomeBot', 5, PermissionFlagsBits.Administrator, true),
    ];
    const store = new Map();
    const guild = (id) => ({
      id,
      client: { db: { get: async (key, fallback) => (store.has(key) ? store.get(key) : fallback), set: async (key, value) => { store.set(key, value); return true; } } },
      roles: { fetch: async () => Object.assign(new Map(roles.map((role) => [role.id, role])), { find: (fn) => roles.find(fn) }) },
    });
    const result = await demoteAdministratorsBelowAdmin(guild(HOME_GUILD_ID));
    assert.deepEqual(result.changed.sort(), ['Old helpers', '🎖️ Supervisor'].sort());
    for (const id of ['3', '4']) {
      const { permissions } = roles.find((role) => role.id === id);
      assert.equal(permissions.has(PermissionFlagsBits.Administrator, false), false);
      assert.ok(permissions.has(PermissionFlagsBits.BanMembers, false));
    }
    assert.ok(roles[0].permissions.has(PermissionFlagsBits.Administrator, false));
    assert.ok(roles[1].permissions.has(PermissionFlagsBits.Administrator, false));
    assert.ok(roles[5].permissions.has(PermissionFlagsBits.Administrator, false));

    // Done once: if the owner gives Administrator back later, it stays.
    roles[3].permissions = new PermissionsBitField(PermissionFlagsBits.Administrator);
    assert.equal((await demoteAdministratorsBelowAdmin(guild(HOME_GUILD_ID))).status, 'done-before');
    assert.ok(roles[3].permissions.has(PermissionFlagsBits.Administrator, false));
    assert.equal((await demoteAdministratorsBelowAdmin(guild('100000000000000099'))).status, 'skipped');
  });

  test('Chat Moderator can timeout, warn and write notes but not kick or ban', () => {
    const permissions = permissionsOf('💬 Chat Moderator');
    assert.ok(permissions.has([PermissionFlagsBits.ModerateMembers, PermissionFlagsBits.ManageMessages], false));
    assert.equal(permissions.any([PermissionFlagsBits.BanMembers, PermissionFlagsBits.KickMembers, PermissionFlagsBits.Administrator], false), false);
  });

  test('Voice Moderator has every voice permission and no chat or member moderation', () => {
    const permissions = permissionsOf('🎧 Voice Moderator');
    assert.ok(permissions.has([...VOICE.filter((flag) => flag !== PermissionFlagsBits.ModerateMembers), PermissionFlagsBits.Connect, PermissionFlagsBits.Speak, PermissionFlagsBits.Stream], false));
    assert.equal(permissions.any([PermissionFlagsBits.ModerateMembers, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.BanMembers, PermissionFlagsBits.KickMembers, PermissionFlagsBits.Administrator], false), false);
  });

  test('Trial Moderator can warn, kick, timeout and write notes but not ban', () => {
    const permissions = permissionsOf('🔰 Trial Moderator');
    assert.ok(permissions.has([PermissionFlagsBits.ModerateMembers, PermissionFlagsBits.KickMembers, PermissionFlagsBits.ManageMessages], false));
    assert.equal(permissions.any([PermissionFlagsBits.BanMembers, PermissionFlagsBits.Administrator], false), false);
  });

  test('Support Staff has no moderation permission', () => {
    const permissions = permissionsOf('🎫 Support Staff');
    assert.equal(permissions.any([...VOICE, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.BanMembers, PermissionFlagsBits.KickMembers, PermissionFlagsBits.Administrator], false), false);
  });
});

describe('the bot never touches staff roles', () => {
  test('existing staff roles are only found, even renamed ones, and missing ones are never created', async () => {
    const store = new Map();
    const client = { db: { get: async (key, fallback) => (store.has(key) ? store.get(key) : fallback), set: async (key, value) => { store.set(key, value); return true; } } };
    const untouchable = (id, name, position) => ({
      id, name, position, managed: false, editable: true,
      edit: async () => { throw new Error('must not edit'); },
      delete: async () => { throw new Error('must not delete'); },
      setPermissions: async () => { throw new Error('must not edit'); },
      setPosition: async () => { throw new Error('must not move'); },
    });
    // The last staff role is missing: it must not be created.
    const roles = new Map(ROLE_DEFINITIONS.slice(0, -1).map((definition, index) => [String(index + 1), untouchable(String(index + 1), definition.name, 50 - index)]));
    roles.find = (fn) => [...roles.values()].find(fn);
    const guild = {
      id: 'g-staff', name: 'g', client,
      members: { me: { permissions: new PermissionsBitField(PermissionsBitField.All), roles: { highest: { position: 99 } } } },
      roles: { fetch: async () => roles, create: async () => { throw new Error('must not create'); } },
    };

    assert.deepEqual(await rememberStaffRoles(guild), { found: ROLE_DEFINITIONS.length - 1 });
    // The owner renames the first staff role: it is still recognised by its saved ID.
    roles.get('1').name = 'The Boss';
    assert.deepEqual(await rememberStaffRoles(guild), { found: ROLE_DEFINITIONS.length - 1 });
  });
});

describe('configured modRole', () => {
  const member = { id: 'm', guild: { ownerId: 'o' }, permissions: new PermissionsBitField(), roles: { cache: new Map([['mod', {}]]) } };
  const config = { modRole: 'mod' };

  test('covers timeout', () => {
    assert.ok(memberHasModerationCommandAccess(member, config, PermissionFlagsBits.ModerateMembers));
  });

  test('never covers ban or kick', () => {
    assert.equal(memberHasModerationCommandAccess(member, config, PermissionFlagsBits.BanMembers), false);
    assert.equal(memberHasModerationCommandAccess(member, config, PermissionFlagsBits.KickMembers), false);
  });
});
