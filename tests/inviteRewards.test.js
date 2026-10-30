import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { PermissionsBitField, PermissionFlagsBits } from 'discord.js';
import { INVITE_REWARDS, CHAOS_GUILD_ID, WELCOME_CHANNEL_ID } from '../src/config/inviteRewards.js';
import {
  STATUS, joinVerdict, isReadyToPay, rankInviters, inviteTier, inviteRoleChanges, inviteWelcomeNotice,
  registerJoin, markLeft, checkInviteReward, sweepInviteRewards, findInviteTierRoles, inviteTopEmbed,
  memberInviteSummary, memberInvitesEmbed,
} from '../src/services/inviteRewardService.js';
import { getEconomyKey, getUserLevelKey } from '../src/utils/database/keys.js';
import { applyWordAliases, resolveCommandAlias } from '../src/config/commands/commandAliases.js';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-09-25T12:00:00Z');
const INVITER = '300000000000000001';
const NEWBIE = '300000000000000002';
const OTHER = '300000000000000003';

function fakeMember(id, { createdTimestamp = NOW - 365 * DAY, bot = false } = {}) {
  const roles = new Map();
  return {
    id,
    user: { id, bot, tag: `user${id}`, createdTimestamp },
    roles: {
      cache: roles,
      add: async (ids) => ids.forEach((roleId) => roles.set(roleId, { id: roleId })),
      remove: async (ids) => ids.forEach((roleId) => roles.delete(roleId)),
    },
  };
}

function fakeSetup() {
  const store = new Map();
  const sent = [];
  const members = new Map();
  // The owner made the invite roles; the bot must never create one.
  const roles = new Map(INVITE_REWARDS.tiers.map((tier, index) => [`90000000000000000${index}`, { id: `90000000000000000${index}`, name: tier.name, managed: false }]));
  const guild = {
    id: CHAOS_GUILD_ID,
    name: 'Chaos',
    members: {
      cache: members,
      me: { permissions: new PermissionsBitField([PermissionFlagsBits.ManageRoles]) },
      fetch: async (id) => { if (!members.has(id)) throw new Error('Unknown Member'); return members.get(id); },
    },
    channels: { cache: new Map([[WELCOME_CHANNEL_ID, { isTextBased: () => true, send: async (payload) => { sent.push(payload); } }]]) },
    roles: {
      cache: roles,
      fetch: async () => roles,
      create: async () => { throw new Error('the bot must not create roles'); },
    },
  };
  const client = {
    store,
    db: {
      get: async (key, fallback = null) => (store.has(key) ? structuredClone(store.get(key)) : fallback),
      set: async (key, value) => { store.set(key, structuredClone(value)); return true; },
      list: async (prefix) => [...store.keys()].filter((key) => key.startsWith(prefix)),
    },
    guilds: { cache: new Map([[CHAOS_GUILD_ID, guild]]) },
  };
  const join = (member) => { members.set(member.id, member); return { ...member, guild, client }; };
  // Chat messages of the member (the reward also needs INVITE_REWARDS.minMessages of them).
  const setMessages = (id, count) => {
    const key = `guild:${CHAOS_GUILD_ID}:chatcounts`;
    store.set(key, { ...(store.get(key) || {}), [id]: count });
  };
  const setLevel = (id, level, messages = INVITE_REWARDS.minMessages) => {
    store.set(getUserLevelKey(CHAOS_GUILD_ID, id), { xp: 0, level, totalXp: 1000, lastMessage: 0, rank: 0 });
    setMessages(id, messages);
  };
  const ccOf = (id) => store.get(getEconomyKey(CHAOS_GUILD_ID, id))?.cc || 0;
  members.set(INVITER, fakeMember(INVITER));
  return { client, guild, store, sent, members, join, setLevel, setMessages, ccOf };
}

describe('invite rewards rules', () => {
  test('the owner asked for 5000 CC (report #230) at level 5 and 50 messages, no stay (report #223), and roles at 5, 10 and 25 invites', () => {
    assert.equal(INVITE_REWARDS.reward, 5000);
    assert.equal(INVITE_REWARDS.level, 5);
    assert.equal(INVITE_REWARDS.minMessages, 50);
    assert.equal(INVITE_REWARDS.minStayDays, 0);
    assert.deepEqual(INVITE_REWARDS.tiers.map((tier) => tier.count), [5, 10, 25]);
  });

  test('a join counts only for a real, first time member invited by someone else', () => {
    const base = { memberId: NEWBIE, inviterId: INVITER, accountCreatedAt: NOW - 30 * DAY, now: NOW };
    assert.equal(joinVerdict(base), null);
    assert.equal(joinVerdict({ ...base, inviterId: null }), 'unknown');
    assert.equal(joinVerdict({ ...base, inviterId: NEWBIE }), 'self');
    assert.equal(joinVerdict({ ...base, inviterIsBot: true }), 'bot');
    assert.equal(joinVerdict({ ...base, beenHereBefore: true }), 'rejoin');
    assert.equal(joinVerdict({ ...base, accountCreatedAt: NOW - 2 * DAY }), 'fake');
  });

  test('pays only a pending invite that reached the level after the stay days', () => {
    const record = { inviterId: INVITER, joinedAt: NOW - 3 * DAY, status: STATUS.PENDING };
    const talked = INVITE_REWARDS.minMessages;
    assert.equal(INVITE_REWARDS.minMessages, 50);
    assert.equal(isReadyToPay(record, 5, NOW, talked), true);
    assert.equal(isReadyToPay(record, 5, NOW, talked - 1), false, 'level 5 without really talking (report #167)');
    assert.equal(isReadyToPay(record, 4, NOW, talked), false);
    // No stay (report #223): an hour after joining is enough with level 5 and 50 messages.
    assert.equal(isReadyToPay({ ...record, joinedAt: NOW - 60 * 60 * 1000 }, 5, NOW, talked), true);
    assert.equal(isReadyToPay({ ...record, joinedAt: NOW - 2 * DAY }, 10, NOW), false);
    assert.equal(isReadyToPay({ ...record, status: STATUS.PAID }, 10, NOW), false);
    assert.equal(isReadyToPay({ ...record, status: STATUS.LEFT }, 10, NOW), false);
  });

  test('ranks inviters by paid invites and keeps only the highest invite role', () => {
    const records = [
      { inviterId: 'a', status: STATUS.PAID }, { inviterId: 'b', status: STATUS.PAID }, { inviterId: 'b', status: STATUS.PAID },
      { inviterId: 'a', status: STATUS.PENDING }, { inviterId: 'a', status: STATUS.PENDING }, { inviterId: 'c', status: STATUS.LEFT },
    ];
    assert.deepEqual(rankInviters(records), [{ userId: 'b', paid: 2, pending: 0 }, { userId: 'a', paid: 1, pending: 2 }]);
    assert.equal(inviteTier(4), null);
    assert.equal(inviteTier(12).count, 10);
    const ids = { 5: 'r5', 10: 'r10', 25: 'r25' };
    assert.deepEqual(inviteRoleChanges(10, ids, new Set(['r5'])), { tier: INVITE_REWARDS.tiers[1], add: ['r10'], remove: ['r5'] });
    assert.deepEqual(inviteRoleChanges(3, ids, new Set(['r5'])).remove, ['r5']);
  });

  test('the welcome notice is small (subtext) and says who invited and the conditions', () => {
    const counted = inviteWelcomeNotice(NEWBIE, { inviterId: INVITER, reason: null });
    assert.ok(counted.split('\n').every((line) => line.startsWith('-# ')));
    assert.match(counted, new RegExp(`دعاه <@${INVITER}>`));
    assert.match(counted, /5,000/);
    assert.match(counted, /لفل 5/);
    assert.match(counted, /50 رسالة/);
    // No stay condition any more (report #223).
    assert.doesNotMatch(counted, /أيام/);
    assert.match(inviteWelcomeNotice(NEWBIE, { inviterId: INVITER, reason: 'fake' }), /مش محسوبة/);
    assert.match(inviteWelcomeNotice(NEWBIE, { inviterId: INVITER, reason: 'rejoin' }), /قبل كده/);
    assert.equal(inviteWelcomeNotice(NEWBIE, { inviterId: null, reason: 'unknown' }), null);
    assert.equal(inviteWelcomeNotice(NEWBIE, null), null);
  });

  test('top invites and my invites are commands', () => {
    assert.equal(applyWordAliases('top', ['invites'], true).commandName, 'invitetop');
    assert.equal(applyWordAliases('توب', ['دعوات'], false).commandName, 'invitetop');
    assert.equal(resolveCommandAlias(applyWordAliases('دعواتي', [], false).commandName), 'invitetop');
    assert.equal(applyWordAliases('دعواتي', ['ليك', 'يا', 'صاحبي'], false), null);
  });

  test('انفايت @member runs the invite command, a sentence does not', () => {
    const mention = `<@${INVITER}>`;
    assert.deepEqual(applyWordAliases('انفايت', [mention], false), { commandName: 'انفايت', args: [mention] });
    assert.equal(resolveCommandAlias('انفايت'), 'invite');
    assert.equal(resolveCommandAlias('انفايتات'), 'invite');
    assert.equal(applyWordAliases('انفايت', ['الرابط', 'فين'], false), null);
    assert.equal(applyWordAliases('توب', ['انفايت'], false).commandName, 'invitetop');
  });

  test('memberInviteSummary counts a member\'s invites by status and finds their next role', () => {
    const records = [
      { memberId: 'a', inviterId: INVITER, joinedAt: 1, status: STATUS.PAID },
      { memberId: 'b', inviterId: INVITER, joinedAt: 3, status: STATUS.PENDING },
      { memberId: 'c', inviterId: INVITER, joinedAt: 2, status: STATUS.LEFT },
      { memberId: 'd', inviterId: INVITER, joinedAt: 4, status: STATUS.FAKE },
      { memberId: 'e', inviterId: OTHER, joinedAt: 5, status: STATUS.PAID },
      { memberId: 'f', inviterId: OTHER, joinedAt: 6, status: STATUS.PAID },
      { memberId: INVITER, inviterId: OTHER, joinedAt: 0, status: STATUS.PAID },
    ];
    const summary = memberInviteSummary(records, INVITER);
    assert.deepEqual([summary.paid, summary.pending, summary.left, summary.fake], [1, 1, 1, 1]);
    assert.equal(summary.rank, 2);
    assert.equal(summary.earned, INVITE_REWARDS.reward);
    assert.equal(summary.nextTier.count, 5);
    assert.equal(summary.invitedBy, OTHER);
    assert.deepEqual(summary.invited.map((record) => record.memberId), ['d', 'b', 'c', 'a']);
    assert.equal(memberInviteSummary(records, NEWBIE).rank, null);
  });
});

describe('invite rewards flow', () => {
  test('pays the inviter 5000 CC once the invited member is level 5 and 3 days in, only once', async () => {
    const setup = fakeSetup();
    const newbie = setup.join(fakeMember(NEWBIE));
    assert.deepEqual(await registerJoin(setup.client, newbie, INVITER, { now: NOW }), { inviterId: INVITER, reason: null });

    // Level 5 on day 1: not yet.
    assert.equal(await checkInviteReward(setup.client, setup.guild, NEWBIE, { level: 5, now: NOW + DAY }), null);
    // Day 3 but level 4: not yet.
    setup.setLevel(NEWBIE, 4);
    assert.equal(await sweepInviteRewards(setup.client, { now: NOW + 3 * DAY }), 0);
    assert.equal(setup.ccOf(INVITER), 0);

    // Level 5 but hardly any chat messages (report #167): not yet.
    setup.setLevel(NEWBIE, 5, 3);
    assert.equal(await sweepInviteRewards(setup.client, { now: NOW + 3 * DAY }), 0);
    assert.equal(setup.ccOf(INVITER), 0);

    setup.setMessages(NEWBIE, INVITE_REWARDS.minMessages);
    assert.equal(await sweepInviteRewards(setup.client, { now: NOW + 3 * DAY }), 1);
    assert.equal(setup.ccOf(INVITER), 5000);
    assert.match(setup.sent[0].content, /5,000/);
    assert.deepEqual(setup.sent[0].allowedMentions, { users: [INVITER] });

    assert.equal(await checkInviteReward(setup.client, setup.guild, NEWBIE, { level: 6, now: NOW + 4 * DAY }), null);
    assert.equal(await sweepInviteRewards(setup.client, { now: NOW + 4 * DAY }), 0);
    assert.equal(setup.ccOf(INVITER), 5000, 'paid only once');

    const top = await inviteTopEmbed(setup.client, setup.guild, INVITER);
    assert.match(top.description, new RegExp(`<@${INVITER}> — \\*\\*1\\*\\* دعوة`));

    const own = await memberInvitesEmbed(setup.client, setup.guild, { id: INVITER, toString: () => `<@${INVITER}>` });
    assert.match(own.description, /الدعوات المحسوبة: \*\*1\*\*/);
    assert.match(own.description, new RegExp(`✅ اتحسبت — <@${NEWBIE}>`));
  });

  test('leaving before the reward, a rejoin and a new account never pay', async () => {
    const setup = fakeSetup();
    const newbie = setup.join(fakeMember(NEWBIE));
    await registerJoin(setup.client, newbie, INVITER, { now: NOW });
    await markLeft(setup.client, CHAOS_GUILD_ID, NEWBIE, { now: NOW + DAY });
    setup.members.delete(NEWBIE);

    // Back through someone else's invite: it's a rejoin, and the old invite stays left.
    const again = setup.join(fakeMember(NEWBIE));
    assert.equal((await registerJoin(setup.client, again, OTHER, { now: NOW + 2 * DAY })).reason, 'rejoin');
    setup.setLevel(NEWBIE, 10);
    assert.equal(await sweepInviteRewards(setup.client, { now: NOW + 10 * DAY }), 0);

    // A member with CC was in the server before this feature knew them.
    const oldTimerId = '300000000000000004';
    setup.store.set(getEconomyKey(CHAOS_GUILD_ID, oldTimerId), { cc: 5 });
    assert.equal((await registerJoin(setup.client, setup.join(fakeMember(oldTimerId)), INVITER, { now: NOW })).reason, 'rejoin');

    const altId = '300000000000000005';
    const alt = setup.join(fakeMember(altId, { createdTimestamp: NOW - DAY }));
    assert.equal((await registerJoin(setup.client, alt, INVITER, { now: NOW })).reason, 'fake');
    setup.setLevel(altId, 10);
    assert.equal(await checkInviteReward(setup.client, setup.guild, altId, { now: NOW + 10 * DAY }), null);

    assert.equal(setup.ccOf(INVITER), 0);
    assert.equal(setup.ccOf(OTHER), 0);
  });

  test('the 5th paid invite gives the 5 invites role', async () => {
    const setup = fakeSetup();
    const roleIds = await findInviteTierRoles(setup.client, setup.guild);
    assert.deepEqual(Object.keys(roleIds), ['5', '10', '25']);
    assert.deepEqual(await findInviteTierRoles(setup.client, setup.guild), roleIds, 'existing roles are reused');

    for (let i = 0; i < 5; i += 1) {
      const id = `31000000000000000${i}`;
      await registerJoin(setup.client, setup.join(fakeMember(id)), INVITER, { now: NOW });
      setup.setLevel(id, 5);
    }
    assert.equal(await sweepInviteRewards(setup.client, { now: NOW + 3 * DAY }), 5);
    assert.equal(setup.ccOf(INVITER), 5 * INVITE_REWARDS.reward);
    assert.deepEqual([...setup.members.get(INVITER).roles.cache.keys()], [roleIds[5]]);
    assert.match(setup.sent.at(-1).content, new RegExp(`<@&${roleIds[5]}>`));
  });

  test('a missing invite role is skipped, never created', async () => {
    const setup = fakeSetup();
    const [firstId] = setup.guild.roles.cache.keys();
    setup.guild.roles.cache.delete(firstId);
    const roleIds = await findInviteTierRoles(setup.client, setup.guild);
    assert.deepEqual(Object.keys(roleIds), ['10', '25']);
    assert.equal(setup.guild.roles.cache.size, INVITE_REWARDS.tiers.length - 1);
  });
});
