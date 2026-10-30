import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { AuditLogEvent, PermissionsBitField } from 'discord.js';
import { HOME_GUILD_ID } from '../src/config/homeGuild.js';
import { AUDIT_LOG_CATEGORY_ID } from '../src/services/auditLogChannelsService.js';
import { ROLE_LOG_SETTINGS, logMemberRoles, logRoleCreate, logRoleUpdate } from '../src/services/logging/roleLogs.js';

const MOD = '200000000000000009';
const MEMBER = '200000000000000001';
const user = (id) => ({ id, tag: `u${id.slice(-2)}` });

function setup({ guildId = HOME_GUILD_ID, audit = [] } = {}) {
  const sent = [];
  let requests = 0;
  const room = { id: '700000000000000001', name: 'roles', parentId: AUDIT_LOG_CATEGORY_ID, send: async (payload) => { sent.push(payload.embeds[0]); return {}; } };
  const channels = new Map([[room.id, room]]);
  const guild = {
    id: guildId,
    client: { user: { id: 'bot' }, db: { get: async (key, fallback) => fallback, set: async () => true } },
    channels: { cache: Object.assign(channels, { find: (fn) => [...channels.values()].find(fn) }), fetch: async () => null },
    fetchAuditLogs: async ({ type }) => {
      requests += 1;
      return { entries: audit.filter((entry) => entry.type === type).map((entry) => ({ createdTimestamp: Date.now(), ...entry })) };
    },
  };
  return { guild, sent, requests: () => requests };
}

const member = (guild, id, roleIds) => ({ guild, id, user: user(id), roles: { cache: new Map(roleIds.map((r) => [r, { id: r }])) } });

describe('the roles log room (kept at the owner\'s request)', () => {
  before(() => { ROLE_LOG_SETTINGS.auditRetryMs = 0; });

  test('a role given by a moderator is logged with who did it; one given by the bot is not', async () => {
    const byMod = setup({ audit: [{ type: AuditLogEvent.MemberRoleUpdate, target: { id: MEMBER }, executor: user(MOD), changes: [{ key: '$add', new: [{ id: 'r1' }] }] }] });
    assert.equal(await logMemberRoles(member(byMod.guild, MEMBER, ['r2']), member(byMod.guild, MEMBER, ['r1'])), true);
    assert.match(byMod.sent[0].description, /➕ اتضافت: <@&r1>/u);
    assert.match(byMod.sent[0].description, /➖ اتشالت: <@&r2>/u);
    assert.match(byMod.sent[0].description, new RegExp(`بواسطة: <@${MOD}>`));

    const byBot = setup({ audit: [{ type: AuditLogEvent.MemberRoleUpdate, target: { id: MEMBER }, executor: user('bot'), changes: [{ key: '$add', new: [{ id: 'r1' }] }] }] });
    assert.equal(await logMemberRoles(member(byBot.guild, MEMBER, []), member(byBot.guild, MEMBER, ['r1'])), false);
    assert.equal(byBot.sent.length, 0);
  });

  test('a burst of role changes shares one audit log request', async () => {
    const { guild, requests } = setup();
    await Promise.all(Array.from({ length: 8 }, (_, i) => {
      const id = `20000000000000010${i}`;
      return logMemberRoles(member(guild, id, []), member(guild, id, ['r1']));
    }));
    assert.equal(requests(), 1);
  });

  test('a role renamed or given permissions is logged; moved only, or made by the bot, is not', async () => {
    const { guild, sent } = setup({ audit: [{ type: AuditLogEvent.RoleCreate, target: { id: 'r9' }, executor: user('bot') }] });
    const oldRole = { id: 'r1', guild, name: 'Helpers', color: 0, permissions: new PermissionsBitField(0n) };
    assert.equal(await logRoleUpdate(oldRole, { ...oldRole, name: 'Mods', permissions: new PermissionsBitField(PermissionsBitField.Flags.BanMembers) }), true);
    assert.match(sent[0].description, /Helpers\*\* ← \*\*Mods/u);
    assert.match(sent[0].description, /BanMembers/u);
    assert.equal(await logRoleUpdate(oldRole, { ...oldRole, position: 7 }), false);
    assert.equal(await logRoleCreate({ id: 'r9', guild, name: 'Ticket' }), false);
  });

  test('another server gets nothing', async () => {
    const { guild, sent } = setup({ guildId: '100000000000000099' });
    assert.equal(await logMemberRoles(member(guild, MEMBER, []), member(guild, MEMBER, ['r1'])), false);
    assert.equal(sent.length, 0);
  });
});
