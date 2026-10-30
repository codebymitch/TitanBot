import { test, describe, mock } from 'node:test';
import assert from 'node:assert/strict';
import { isTrusted } from '../src/utils/antiNukeLogging.js';
import { handleUntrustedBotJoin } from '../src/utils/antiRaidBots.js';

const OWNER_ID = '100';
const BOT_ID = '200';

function makeGuild({ config = {}, members = {} } = {}) {
  const guild = {
    id: '1',
    ownerId: OWNER_ID,
    client: {
      user: { id: BOT_ID },
      db: { get: async () => config },
    },
    members: {
      fetch: async (id) => {
        if (!members[id]) throw new Error('Unknown member');
        return members[id];
      },
    },
    channels: { cache: new Map() },
    fetchAuditLogs: async () => ({ entries: [] }),
  };
  return guild;
}

function memberWithRoles(id, roleIds) {
  return { id, roles: { cache: { some: (fn) => roleIds.some((roleId) => fn({ id: roleId })) } } };
}

describe('isTrusted', () => {
  test('trusts the server owner and the bot itself', async () => {
    const guild = makeGuild();
    assert.equal(await isTrusted(guild, {}, OWNER_ID), true);
    assert.equal(await isTrusted(guild, {}, BOT_ID), true);
  });

  test('trusts users on the trusted list', async () => {
    const guild = makeGuild();
    assert.equal(await isTrusted(guild, { antiNukeTrustedUsers: ['300'] }, '300'), true);
  });

  test('trusts members holding a trusted role', async () => {
    const guild = makeGuild({ members: { 400: memberWithRoles('400', ['r1']) } });
    assert.equal(await isTrusted(guild, { antiNukeTrustedRoles: ['r1'] }, '400'), true);
  });

  test('does not trust anyone else', async () => {
    const guild = makeGuild({ members: { 500: memberWithRoles('500', ['r2']) } });
    const config = { antiNukeTrustedUsers: ['300'], antiNukeTrustedRoles: ['r1'] };
    assert.equal(await isTrusted(guild, config, '500'), false);
    assert.equal(await isTrusted(guild, config, 'missing'), false);
    assert.equal(await isTrusted(guild, null, '500'), false);
  });
});

describe('handleUntrustedBotJoin', () => {
  function makeBotJoin({ inviterId, config }) {
    const kicked = [];
    const inviter = { id: inviterId, kickable: true, user: { id: inviterId }, kick: async () => { kicked.push(inviterId); } };
    const guild = makeGuild({ config, members: { [inviterId]: inviter } });
    guild.fetchAuditLogs = async () => ({
      entries: [{ target: { id: '900' }, executor: { id: inviterId }, createdTimestamp: Date.now() }],
    });
    const bot = {
      id: '900',
      guild,
      client: guild.client,
      kickable: true,
      user: { bot: true, tag: 'EvilBot#0001' },
      kick: async () => { kicked.push('900'); },
    };
    return { bot, kicked };
  }

  test('lets a trusted user add a bot', async () => {
    const { bot, kicked } = makeBotJoin({ inviterId: '300', config: { antiNukeTrustedUsers: ['300'] } });
    assert.equal(await handleUntrustedBotJoin(bot), false);
    assert.deepEqual(kicked, []);
  });

  test('kicks the bot and whoever added it when they are not trusted', async () => {
    const { bot, kicked } = makeBotJoin({ inviterId: '600', config: {} });
    assert.equal(await handleUntrustedBotJoin(bot), true);
    assert.deepEqual(kicked.sort(), ['600', '900']);
  });

  test('ignores humans and the bot itself', async () => {
    const { bot } = makeBotJoin({ inviterId: '600', config: {} });
    assert.equal(await handleUntrustedBotJoin({ ...bot, user: { bot: false } }), false);
    assert.equal(await handleUntrustedBotJoin({ ...bot, id: BOT_ID }), false);
  });
});

describe('protected board channels', async () => {
  const { handleProtectedChannelMessage } = await import('../src/services/protectedChannelsService.js');
  const { TRUSTED_BOARD_CHANNEL_ID } = await import('../src/services/trustedBoardService.js');

  function makeMessage({ authorId, bot = false, channelId = TRUSTED_BOARD_CHANNEL_ID }) {
    const sent = [];
    const message = {
      channelId,
      guild: { id: '1' },
      author: { id: authorId, bot },
      client: { user: { id: BOT_ID } },
      deleted: false,
      delete: async () => { message.deleted = true; },
      channel: { send: async (payload) => { sent.push(payload); return { delete: async () => {} }; } },
    };
    return { message, sent };
  }

  test('removes messages from other members and warns them', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const { message, sent } = makeMessage({ authorId: '700' });
    assert.equal(await handleProtectedChannelMessage(message), true);
    assert.equal(message.deleted, true);
    assert.equal(sent.length, 1);
  });

  test('removes messages from other bots without a warning', async () => {
    const { message, sent } = makeMessage({ authorId: '800', bot: true });
    assert.equal(await handleProtectedChannelMessage(message), true);
    assert.equal(message.deleted, true);
    assert.equal(sent.length, 0);
  });

  test('allows the owners and this bot, and ignores other channels', async () => {
    for (const authorId of ['1159601661392715906', BOT_ID]) {
      const { message } = makeMessage({ authorId });
      assert.equal(await handleProtectedChannelMessage(message), false);
      assert.equal(message.deleted, false);
    }
    const { message } = makeMessage({ authorId: '700', channelId: '123' });
    assert.equal(await handleProtectedChannelMessage(message), false);
  });
});

describe('trusted board embed limits', async () => {
  const { buildTrustedBoardFields } = await import('../src/services/trustedBoardService.js');
  const line = (i) => `> <@${String(i).padStart(18, '1')}> ・ \`member_name_${i}\``;
  const size = (fields) => fields.reduce((sum, { name, value }) => sum + name.length + value.length, 0);

  test('shows every entry when the list is small', () => {
    const fields = buildTrustedBoardFields([
      { title: 'A', lines: [line(1), line(2)] },
      { title: 'B', lines: [] },
      { title: 'C', lines: [line(3)] },
    ], { charBudget: 5000 });
    assert.deepEqual(fields.map((f) => f.name), ['A — 2', 'B — 0', 'C — 1']);
    assert.equal(fields[0].value, `${line(1)}\n${line(2)}`);
    assert.equal(fields[1].value, '> *لا يوجد*');
  });

  test('stays inside Discord limits with very long lists', () => {
    const many = Array.from({ length: 400 }, (_, i) => line(i));
    const fields = buildTrustedBoardFields([
      { title: 'A', lines: many },
      { title: 'B', lines: many.slice(0, 5) },
      { title: 'C', lines: many },
    ], { charBudget: 5700 });
    assert.ok(size(fields) <= 5700, `total ${size(fields)} is over budget`);
    assert.ok(fields.length <= 25);
    assert.ok(fields.every(({ value }) => value.length <= 1024));
    assert.equal(fields[0].name, 'A — 400');
    assert.ok(fields.some(({ value }) => value.includes('كمان')), 'cut lists say how many were left out');
    assert.ok(fields.some(({ name }) => name === 'B — 5'));
    assert.ok(fields.some(({ name }) => name === 'C — 400'));
  });
});
