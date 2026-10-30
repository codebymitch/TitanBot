import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { PermissionsBitField } from 'discord.js';
import { HOME_GUILD_ID } from '../src/config/homeGuild.js';
import { ROLE_DEFINITIONS } from '../src/services/staffRoleHierarchyService.js';
import {
  saveLeavingMember, restoreRejoiningMember, decideRejoinRoles, REJOIN_APPROVAL_CHANNEL_ID, REJOIN_LOG_CHANNEL_ID,
} from '../src/services/moderation/rejoinRestore.js';
import rejoinButtons from '../src/interactions/buttons/moderation/rejoinRoles.js';

const MEMBER = '200000000000000001';
const TRUSTED = '200000000000000002';
const STRANGER = '200000000000000003';
const role = (id, name, permissions = 0n, managed = false) => ({ id, name, managed, editable: true, permissions: new PermissionsBitField(permissions) });
const NORMAL = role('400000000000000001', 'Level 10');
const STAFF = role('400000000000000002', ROLE_DEFINITIONS.find((definition) => definition.name.includes('Support')).name);
const DANGEROUS = role('400000000000000003', 'Helpers', PermissionsBitField.Flags.ManageMessages);
const BOOSTER = role('400000000000000004', 'Booster', 0n, true);

function setup(guildId = HOME_GUILD_ID) {
  const store = new Map();
  const sent = { approval: [], log: [] };
  const roles = new Map([NORMAL, STAFF, DANGEROUS, BOOSTER].map((r) => [r.id, r]));
  const members = new Map();
  const channel = (list) => ({ send: async (payload) => { list.push(payload); return { delete: async () => {} }; } });
  const guild = {
    id: guildId, ownerId: '1',
    roles: { cache: roles },
    channels: { cache: new Map([[REJOIN_APPROVAL_CHANNEL_ID, channel(sent.approval)], [REJOIN_LOG_CHANNEL_ID, channel(sent.log)]]), fetch: async () => null },
    members: { fetch: async (id) => members.get(id) || null },
    client: {
      user: { id: 'bot' },
      db: {
        get: async (key, fallback) => (key.includes(':config') ? { antiNukeTrustedUsers: [TRUSTED] } : (store.has(key) ? structuredClone(store.get(key)) : fallback)),
        set: async (key, value) => { store.set(key, structuredClone(value)); return true; },
        delete: async (key) => store.delete(key),
      },
    },
  };
  const member = (owned) => {
    const given = [];
    const m = {
      id: MEMBER, guild, user: { id: MEMBER, bot: false }, nickname: 'Ziko', manageable: true, given,
      roles: { cache: new Map(owned.map((r) => [r.id, r])), add: async (ids) => { given.push(...ids); } },
      setNickname: async (nick) => { m.nickname = nick; },
    };
    members.set(MEMBER, m);
    return m;
  };
  return { guild, member, sent, store, members };
}

describe('a member who comes back gets their things back (owner\'s request)', () => {
  test('normal roles and the nickname come back; staff and dangerous roles wait for a trusted ✅', async () => {
    const { guild, member, sent } = setup();
    const leaving = member([{ id: HOME_GUILD_ID, managed: false }, NORMAL, STAFF, DANGEROUS, BOOSTER]);
    assert.deepEqual((await saveLeavingMember(leaving)).roles, [NORMAL.id, STAFF.id, DANGEROUS.id]);

    const back = member([]);
    back.nickname = null;
    const result = await restoreRejoiningMember(back);
    assert.deepEqual(result.restored, [NORMAL.id]);
    assert.deepEqual(result.pending, [STAFF.id, DANGEROUS.id]);
    assert.deepEqual(back.given, [NORMAL.id]);
    assert.equal(back.nickname, 'Ziko');
    assert.equal(sent.approval.length, 1);
    assert.match(sent.approval[0].embeds[0].description, new RegExp(`<@&${STAFF.id}>`));

    assert.equal((await decideRejoinRoles(guild, STRANGER, MEMBER, true)).reason, 'not_trusted');
    assert.deepEqual(back.given, [NORMAL.id]);

    // The trusted member presses ✅: the roles come back, the request is deleted, the log says so.
    let deleted = false;
    const interaction = {
      inGuild: () => true, guild, user: { id: TRUSTED, toString: () => `<@${TRUSTED}>` },
      message: { delete: async () => { deleted = true; } },
      deferUpdate: async () => {}, reply: async () => {},
    };
    await rejoinButtons.execute(interaction, guild.client, ['approve', MEMBER]);
    assert.deepEqual(back.given, [NORMAL.id, STAFF.id, DANGEROUS.id]);
    assert.equal(deleted, true);
    assert.match(sent.log[0].embeds[0].title, /تمت الموافقة/u);
    assert.match(sent.log[0].embeds[0].description, new RegExp(`<@${TRUSTED}>`));
    assert.equal((await decideRejoinRoles(guild, TRUSTED, MEMBER, true)).reason, 'nothing');
  });

  test('❌ drops the staff roles, and the refusal is logged', async () => {
    const { guild, member, sent } = setup();
    await saveLeavingMember(member([STAFF]));
    const back = member([]);
    await restoreRejoiningMember(back);
    const interaction = { inGuild: () => true, guild, user: { id: '1159601661392715906' }, message: { delete: async () => {} }, deferUpdate: async () => {}, reply: async () => {} };
    await rejoinButtons.execute(interaction, guild.client, ['deny', MEMBER]);
    assert.deepEqual(back.given, []);
    assert.match(sent.log[0].embeds[0].title, /اترفض/u);
  });

  test('a staff role above the bot\'s role is still asked about, marked ⚠️, and the log says it wasn\'t given', async () => {
    const { guild, member, sent } = setup();
    const high = { ...role('400000000000000009', ROLE_DEFINITIONS[2].name, PermissionsBitField.Flags.Administrator), editable: false };
    guild.roles.cache.set(high.id, high);
    await saveLeavingMember(member([high, STAFF]));
    const back = member([]);
    const result = await restoreRejoiningMember(back);
    assert.deepEqual(result.pending, [high.id, STAFF.id]);
    assert.equal(sent.approval.length, 1);
    assert.match(sent.approval[0].embeds[0].description, new RegExp(`<@&${high.id}> ⚠️`));
    assert.match(sent.approval[0].embeds[0].description, /فوق رول البوت/u);

    const interaction = { inGuild: () => true, guild, user: { id: TRUSTED }, message: { delete: async () => {} }, deferUpdate: async () => {}, reply: async () => {} };
    await rejoinButtons.execute(interaction, guild.client, ['approve', MEMBER]);
    assert.deepEqual(back.given, [STAFF.id]);
    assert.match(sent.log[0].embeds[0].description, new RegExp(`مرجعتش \\(فوق رول البوت\\): <@&${high.id}>`));
  });

  test('another server: nothing is saved or given back', async () => {
    const { member, store } = setup('100000000000000099');
    assert.equal(await saveLeavingMember(member([NORMAL, STAFF])), null);
    assert.equal(store.size, 0);
    assert.equal(await restoreRejoiningMember(member([])), null);
  });
});

describe('the level comes back too', () => {
  test('in our server leaving keeps the level; another server still deletes it', async () => {
    const { default: guildMemberRemove } = await import('../src/events/guildMemberRemove.js');
    const { getUserLevelKey } = await import('../src/utils/database/keys.js');
    for (const guildId of [HOME_GUILD_ID, '100000000000000099']) {
      const store = new Map([[getUserLevelKey(guildId, MEMBER), { xp: 5000, level: 12 }]]);
      const db = {
        get: async (key, fallback) => (store.has(key) ? store.get(key) : fallback),
        set: async (key, value) => { store.set(key, value); return true; },
        delete: async (key) => store.delete(key),
        list: async () => [],
      };
      const client = { db, guilds: { cache: new Map(), fetch: async () => null }, user: { id: 'bot' } };
      const guild = { id: guildId, client, memberCount: 10, channels: { cache: new Map() }, roles: { cache: new Map() }, members: { me: null } };
      const member = { id: MEMBER, guild, client, user: { id: MEMBER, tag: 'm', bot: false, toString: () => `<@${MEMBER}>`, displayAvatarURL: () => '' }, roles: { cache: new Map() }, nickname: null, joinedTimestamp: Date.now() };
      await guildMemberRemove.execute(member);
      assert.equal(store.has(getUserLevelKey(guildId, MEMBER)), guildId === HOME_GUILD_ID, guildId);
    }
  });
});
