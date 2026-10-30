import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { AuditLogEvent, PermissionsBitField } from 'discord.js';
import { HOME_GUILD_ID } from '../src/config/homeGuild.js';
import {
  handleDangerCommand, handleDangerAuditEntry, handleDangerMessage, blockDangerCommand, punishDanger,
  isOnDangerList, resetDangerCooldowns, DANGER_NOTICE_CHANNEL_ID, DANGER_LOG_CHANNEL_ID, DANGER_TIMEOUT_MS,
} from '../src/services/moderation/dangerList.js';

const OWNER = '1159601661392715906';
const TRUSTED = '200000000000000002';
const STRANGER = '200000000000000003';
const BAD = '200000000000000004';

function setup(guildId = HOME_GUILD_ID) {
  const store = new Map();
  const sent = { notice: [], log: [], reply: [] };
  const timeouts = [];
  const members = new Map();
  const client = {
    user: { id: 'bot' },
    db: {
      get: async (key, fallback) => (key.includes(':config') ? { antiNukeTrustedUsers: [TRUSTED] } : (store.has(key) ? structuredClone(store.get(key)) : fallback)),
      set: async (key, value) => { store.set(key, structuredClone(value)); return true; },
    },
  };
  const guild = { id: guildId, ownerId: '1', client, members: { fetch: async (id) => members.get(id) || null } };
  const channel = (id, list) => ({
    id, guild, client,
    send: async (payload) => { list.push(payload); return { id: `m${list.length}`, edit: async () => {} }; },
    messages: { fetch: async () => new Map() },
  });
  guild.channels = {
    cache: new Map([[DANGER_NOTICE_CHANNEL_ID, channel(DANGER_NOTICE_CHANNEL_ID, sent.notice)], [DANGER_LOG_CHANNEL_ID, channel(DANGER_LOG_CHANNEL_ID, sent.log)]]),
    fetch: async () => null,
  };
  for (const id of [BAD, STRANGER, OWNER]) {
    members.set(id, { id, timeout: async (ms, reason) => { timeouts.push({ id, ms, reason }); } });
  }
  const message = (authorId, content, extra = {}) => ({
    guild, author: { id: authorId }, content,
    channel: { send: async (payload) => { sent.reply.push(payload); } },
    delete: async () => { message.deleted = true; },
    ...extra,
  });
  return { guild, sent, timeouts, message, store };
}

const args = (text) => text.split(/\s+/u).slice(1);

describe('خطر: the danger list (reports #218, #219)', () => {
  beforeEach(() => resetDangerCooldowns());

  test('a trusted member adds someone: notice and board in the trusted channel', async () => {
    const { guild, sent, message } = setup();
    const msg = message(TRUSTED, `خطر <@${BAD}>`);
    assert.equal(await handleDangerCommand(msg, args(msg.content)), true);
    assert.equal(await isOnDangerList(guild.client, guild.id, BAD), true);
    assert.match(sent.notice[0].content, /اتضاف لقائمة الخطر/u);
    assert.match(sent.notice[1].embeds[0].title, /قائمة الخطر/u);
    assert.match(sent.notice[1].embeds[0].description, new RegExp(BAD));
    assert.match(sent.reply[0].content, /تايم أوت أسبوع/u);
  });

  test('`خطر` alone lists, `خطر شيل` removes', async () => {
    const { guild, sent, message } = setup();
    await handleDangerCommand(message(OWNER, `خطر ${BAD}`), [BAD]);
    await handleDangerCommand(message(OWNER, 'خطر'), []);
    assert.match(sent.reply.at(-1).content, new RegExp(BAD));
    await handleDangerCommand(message(OWNER, `خطر شيل <@${BAD}>`), ['شيل', `<@${BAD}>`]);
    assert.equal(await isOnDangerList(guild.client, guild.id, BAD), false);
    assert.match(sent.notice.at(-2).content, /اتشال/u);
  });

  test('a stranger or a normal sentence is just chat; owners cannot be added', async () => {
    const { guild, sent, message } = setup();
    assert.equal(await handleDangerCommand(message(STRANGER, `خطر <@${BAD}>`), [`<@${BAD}>`]), false);
    assert.equal(await handleDangerCommand(message(TRUSTED, 'خطر جدا'), ['جدا']), false);
    assert.equal(await isOnDangerList(guild.client, guild.id, BAD), false);
    await handleDangerCommand(message(TRUSTED, `خطر ${OWNER}`), [OWNER]);
    assert.equal(await isOnDangerList(guild.client, guild.id, OWNER), false);
    assert.match(sent.reply[0].content, /صاحب السيرفر/u);
  });

  test('a dangerous audit-log action by a listed member: a week of timeout and a log line', async () => {
    const { guild, sent, timeouts, message } = setup();
    await handleDangerCommand(message(TRUSTED, `خطر ${BAD}`), [BAD]);
    assert.equal(await handleDangerAuditEntry({ action: AuditLogEvent.ChannelDelete, executorId: BAD }, guild), 'done');
    assert.deepEqual(timeouts.map((t) => [t.id, t.ms]), [[BAD, DANGER_TIMEOUT_MS]]);
    assert.match(sent.log[0].embeds[0].description, /مسح روم/u);
    // A burst of entries from the same attack gives one timeout and one log line.
    await handleDangerAuditEntry({ action: AuditLogEvent.RoleDelete, executorId: BAD }, guild);
    assert.equal(timeouts.length, 1);
  });

  test('harmless actions and members off the list are left alone', async () => {
    const { guild, timeouts, message } = setup();
    await handleDangerCommand(message(TRUSTED, `خطر ${BAD}`), [BAD]);
    assert.equal(await handleDangerAuditEntry({ action: AuditLogEvent.MemberUpdate, executorId: BAD, targetId: BAD, changes: [{ key: 'nick', new: 'x' }] }, guild), null);
    assert.equal(await handleDangerAuditEntry({ action: AuditLogEvent.ChannelDelete, executorId: STRANGER }, guild), null);
    assert.equal(timeouts.length, 0);
    assert.equal(await handleDangerAuditEntry({ action: AuditLogEvent.MemberUpdate, executorId: BAD, targetId: STRANGER, changes: [{ key: 'communication_disabled_until', new: '2030' }] }, guild), 'done');
  });

  test('@everyone, an invite link or a ban command from a listed member is punished', async () => {
    const { guild, timeouts, message } = setup();
    await handleDangerCommand(message(TRUSTED, `خطر ${BAD}`), [BAD]);
    const everyone = message(BAD, 'هاي @everyone');
    assert.equal(await handleDangerMessage(everyone), true);
    assert.equal(timeouts.length, 1);
    resetDangerCooldowns();
    assert.equal(await handleDangerMessage(message(BAD, 'ادخلوا discord.gg/abc')), true);
    assert.equal(await handleDangerMessage(message(BAD, 'ازيكم')), false);
    resetDangerCooldowns();
    assert.equal(await blockDangerCommand(guild, BAD, 'ban'), true);
    assert.equal(await blockDangerCommand(guild, BAD, 'rank'), false);
    assert.equal(timeouts.length, 3);
    assert.equal(await blockDangerCommand(guild, STRANGER, 'ban'), false);
  });

  test('adding takes the admin roles off, removing gives them back', async () => {
    const { guild, sent, message } = setup();
    const role = (id, permissions = 0n, editable = true) => ({ id, name: id, managed: false, editable, permissions: new PermissionsBitField(permissions) });
    const NORMAL = role('400000000000000001');
    const MOD = role('400000000000000002', PermissionsBitField.Flags.ManageMessages);
    const HIGH = role('400000000000000003', PermissionsBitField.Flags.Administrator, false);
    guild.roles = { cache: new Map([NORMAL, MOD, HIGH].map((r) => [r.id, r])) };
    const cache = new Map([NORMAL, MOD, HIGH].map((r) => [r.id, r]));
    const bad = await guild.members.fetch(BAD);
    bad.roles = {
      cache,
      remove: async (ids) => ids.forEach((id) => cache.delete(id)),
      add: async (ids) => ids.forEach((id) => cache.set(id, guild.roles.cache.get(id))),
    };

    await handleDangerCommand(message(TRUSTED, `خطر ${BAD}`), [BAD]);
    assert.deepEqual([...cache.keys()].sort(), [NORMAL.id, HIGH.id]);
    assert.match(sent.notice[0].content, new RegExp(`اتشالت منه رولات الإدارة: <@&${MOD.id}>`));
    assert.match(sent.notice[0].content, new RegExp(`فوق رول البوت\\): <@&${HIGH.id}>`));

    await handleDangerCommand(message(TRUSTED, `خطر شيل ${BAD}`), ['شيل', BAD]);
    assert.equal(cache.has(MOD.id), true);
    assert.match(sent.reply.at(-1).content, /رجعتله رولات الإدارة/u);
  });

  test('another server keeps nothing of this', async () => {
    const { guild, sent, timeouts, message, store } = setup('300000000000000001');
    assert.equal(await handleDangerCommand(message(OWNER, `خطر ${BAD}`), [BAD]), false);
    store.set(`guild:${guild.id}:dangerList`, [{ userId: BAD, addedBy: OWNER, addedAt: 0 }]);
    assert.equal(await isOnDangerList(guild.client, guild.id, BAD), false);
    assert.equal(await handleDangerAuditEntry({ action: AuditLogEvent.ChannelDelete, executorId: BAD }, guild), null);
    assert.equal(await punishDanger(guild, BAD, 'x'), null);
    assert.equal(timeouts.length + sent.notice.length + sent.log.length, 0);
  });
});
