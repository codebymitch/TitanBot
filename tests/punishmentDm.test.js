import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { PermissionsBitField } from 'discord.js';
import { buildPunishmentDm, sendPunishmentDm, unbanDmLine } from '../src/services/moderation/punishmentDm.js';
import { ModerationService } from '../src/services/moderation/moderationService.js';

const guild = { id: 'g', name: 'Chaos', iconURL: () => null, vanityURLCode: 'chaos' };

describe('ban / kick DM (report #133)', () => {
  test('says what happened and why, and who to talk to if it was unfair', () => {
    const member = { id: '200000000000000001', toString: () => '<@200000000000000001>' };
    const moderator = { id: '200000000000000002', user: { tag: 'mod#1' } };
    const withStaff = buildPunishmentDm(guild, 'ban', 'سبام', null, { user: member, moderator });
    assert.match(withStaff.embeds[0].description, /^<@200000000000000001> اتعملك/u);
    assert.match(withStaff.embeds[0].description, /لو حاسس إنك مظلوم، اتفاهم مع الإداري <@200000000000000002> \(mod#1\)/u);
    const ban = buildPunishmentDm(guild, 'ban', 'سبام');
    assert.match(ban.embeds[0].description, /بان[\s\S]*Chaos[\s\S]*السبب:\*\* سبام/u);
    assert.equal(ban.components.length, 0);
    const kick = buildPunishmentDm(guild, 'kick', 'شتيمة', 'https://discord.gg/chaos');
    assert.match(kick.embeds[0].description, /كيك/u);
    assert.equal(kick.components.length, 1);
  });

  test('closed DMs never stop the punishment, and bots are not messaged', async () => {
    assert.equal(await sendPunishmentDm(guild, { id: 'u', send: async () => { throw new Error('Cannot send messages to this user'); } }, 'ban', 'x'), false);
    assert.equal(await sendPunishmentDm(guild, { id: 'b', bot: true, send: async () => { throw new Error('no'); } }, 'kick', 'x'), false);
    assert.equal(await sendPunishmentDm(guild, { id: 'u', send: async () => {} }, 'warn', 'x'), false);
  });

  test('the DM is sent before the ban and the kick, with the member mentioned', async () => {
    const order = [];
    const sent = [];
    const user = { id: '200000000000000001', tag: 'u', toString: () => '<@200000000000000001>', send: async (payload) => { sent.push(payload); order.push('dm'); } };
    const moderator = { id: '200000000000000002', user: { tag: 'mod' }, permissions: new PermissionsBitField(PermissionsBitField.All) };
    const g = {
      ...guild,
      ownerId: moderator.id,
      client: { db: { get: async (k, f) => f, set: async () => true } },
      members: { fetch: async () => null, ban: async () => order.push('ban') },
      channels: { cache: new Map() },
    };
    await ModerationService.banUser({ guild: g, user, moderator, reason: 'r' }).catch(() => {});
    assert.deepEqual(order.slice(0, 2), ['dm', 'ban']);
    assert.equal(sent[0].content, '<@200000000000000001>');
    assert.match(sent[0].embeds[0].description, /اتفاهم مع الإداري <@200000000000000002> \(mod\)/u);

    order.length = 0;
    const member = { id: user.id, user, kickable: true, kick: async () => order.push('kick'), roles: { highest: { position: 0 } }, guild: g };
    const orig = ModerationService.assertModerationHierarchy;
    ModerationService.assertModerationHierarchy = () => {};
    try {
      await ModerationService.kickUser({ guild: g, member, moderator, reason: 'r' }).catch(() => {});
    } finally {
      ModerationService.assertModerationHierarchy = orig;
    }
    assert.deepEqual(order.slice(0, 2), ['dm', 'kick']);
  });

  test('unban (report #160): tells the member the ban was lifted, with the way back, and no appeal line', async () => {
    const member = { id: '200000000000000001', toString: () => '<@200000000000000001>' };
    const moderator = { id: '200000000000000002', user: { tag: 'mod' } };
    const dm = buildPunishmentDm(guild, 'unban', 'اتفك', 'https://discord.gg/chaos', { user: member, moderator });
    assert.match(dm.embeds[0].description, /اتفك/u);
    assert.doesNotMatch(dm.embeds[0].description, /مظلوم/u);
    assert.equal(dm.components.length, 1);
    const sent = [];
    assert.equal(await sendPunishmentDm(guild, { id: 'u', toString: () => '<@u>', send: async (p) => sent.push(p) }, 'unban', 'x', moderator), true);
    assert.equal(sent.length, 1);
    assert.match(unbanDmLine(true), /اتبعت/u);
    assert.match(unbanDmLine(false), /ابعتله لينك السيرفر/u);
  });
});
