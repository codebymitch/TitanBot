import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { handleGamesBotOutsideChannel, TRADER_GAME_IDLE_MS } from '../src/services/cc/gamesBotChannel.js';
import { HOME_GUILD_ID } from '../src/config/homeGuild.js';
import { traderRoleSettings } from '../src/config/store/ccStoreItems.js';
import { CLOVER_BOT_ID, GAMES_BOTS_CHANNEL_ID } from '../src/config/games.js';
import { investReceiptEmbed, sellReceiptEmbed } from '../src/services/cc/bourseUi.js';
import { ccProfileEmbed } from '../src/commands/Games/cc.js';

function botMessage(channelId, { authorId = CLOVER_BOT_ID, parentId = null, userId = '200000000000000001' } = {}) {
  const sent = [];
  let deleted = false;
  return {
    guild: { id: 'g' },
    channelId,
    channel: { id: channelId, parentId, send: async (payload) => { sent.push(payload); return { delete: async () => {} }; } },
    author: { id: authorId, bot: true },
    interactionMetadata: { user: { id: userId } },
    delete: async () => { deleted = true; },
    get deleted() { return deleted; },
    sent,
  };
}

describe('games bots channel (report #121)', () => {
  test('Clover messages outside the channel are deleted with one notice per 30 seconds', async () => {
    const first = botMessage('111111111111111111');
    assert.equal(await handleGamesBotOutsideChannel(first, { now: 1_000_000 }), true);
    assert.equal(first.deleted, true);
    assert.match(first.sent[0].content, new RegExp(`<#${GAMES_BOTS_CHANNEL_ID}>`));
    assert.deepEqual(first.sent[0].allowedMentions, { users: ['200000000000000001'] });

    const second = botMessage('111111111111111111');
    assert.equal(await handleGamesBotOutsideChannel(second, { now: 1_010_000 }), true);
    assert.equal(second.deleted, true);
    assert.equal(second.sent.length, 0);
  });

  test('Clover in its channel or a thread of it, and other bots, are left alone', async () => {
    assert.equal(await handleGamesBotOutsideChannel(botMessage(GAMES_BOTS_CHANNEL_ID)), false);
    assert.equal(await handleGamesBotOutsideChannel(botMessage('222222222222222222', { parentId: GAMES_BOTS_CHANNEL_ID })), false);
    assert.equal(await handleGamesBotOutsideChannel(botMessage('111111111111111111', { authorId: '300000000000000009' })), false);
  });
});

describe('the trader role opens bot games anywhere (report #182)', () => {
  const TRADER_ROLE = '400000000000000001';
  const TRADER = '200000000000000011';
  const MEMBER = '200000000000000012';
  const client = { db: { get: async (key, fallback) => fallback, set: async () => true } };
  const roles = new Map([[TRADER_ROLE, { id: TRADER_ROLE, name: traderRoleSettings.name, managed: false }]]);
  const members = new Map([
    [TRADER, { id: TRADER, roles: { cache: new Map([[TRADER_ROLE, {}]]) } }],
    [MEMBER, { id: MEMBER, roles: { cache: new Map() } }],
  ]);
  const homeMessage = (channelId, options = {}) => Object.assign(botMessage(channelId, options), {
    client,
    guild: { id: HOME_GUILD_ID, roles: { cache: roles, fetch: async (id) => roles.get(id) || null }, members: { cache: members, fetch: async (id) => members.get(id) || null } },
  });

  test('a trader\'s game stays in the chat while it goes on; a member\'s is still removed', async () => {
    const start = 5_000_000;
    const member = homeMessage('333333333333333333', { userId: MEMBER });
    assert.equal(await handleGamesBotOutsideChannel(member, { now: start }), true);
    assert.equal(member.deleted, true);
    assert.match(member.sent[0].content, /رول التاجر/u);

    const trader = homeMessage('333333333333333333', { userId: TRADER });
    assert.equal(await handleGamesBotOutsideChannel(trader, { now: start + 1000 }), false);
    assert.equal(trader.deleted, false);

    // The rest of the game (no slash command on these messages) stays while the game goes on.
    const round = homeMessage('333333333333333333', { userId: null });
    round.interactionMetadata = null;
    assert.equal(await handleGamesBotOutsideChannel(round, { now: start + 4 * 60_000 }), false);
    const later = homeMessage('333333333333333333', { userId: null });
    later.interactionMetadata = null;
    assert.equal(await handleGamesBotOutsideChannel(later, { now: start + 4 * 60_000 + TRADER_GAME_IDLE_MS + 1 }), true);
  });

  test('a reply to a trader\'s typed command counts too', async () => {
    const message = homeMessage('444444444444444444', { userId: null });
    message.interactionMetadata = null;
    message.reference = { messageId: '1' };
    message.fetchReference = async () => ({ author: { id: TRADER, bot: false } });
    assert.equal(await handleGamesBotOutsideChannel(message, { now: 9_000_000 }), false);
  });

  test('another server: a trader\'s game outside the channel is still removed', async () => {
    const message = Object.assign(homeMessage('555555555555555555', { userId: TRADER }), { guild: { id: '100000000000000099', members: { cache: members } } });
    assert.equal(await handleGamesBotOutsideChannel(message, { now: 9_500_000 }), true);
    assert.doesNotMatch(message.sent[0].content, /رول التاجر/u);
  });
});

describe('CC messages', () => {
  const user = { id: 'u', toString: () => '<@u>', displayAvatarURL: () => 'https://x/a.png' };
  const asset = { emoji: '🏍️', name: 'موتوسيكل' };

  test('the invest receipt shows what was bought on top and the numbers as cards (report #123)', () => {
    const embed = investReceiptEmbed(user, { asset, quantity: 1, price: 432, cost: 432, owned: 1, before: 438, balance: 6 });
    assert.match(embed.description, /<@u> اشترى \*\*🏍️ موتوسيكل × 1\*\*/u);
    assert.deepEqual(embed.fields.map((field) => field.name), ['🏷️ سعر القطعة', '💵 اتخصم', '💼 معاك دلوقتي', '💰 رصيدك']);
    assert.match(embed.fields[3].value, /قبل: \*\*438\*\*[\s\S]*دلوقتي: \*\*6\*\*/u);
  });

  test('the sell receipt uses cards too', () => {
    const embed = sellReceiptEmbed(user, { asset, quantity: 2, price: 500, fee: 50, received: 950, profit: 100, owned: 0, before: 6, balance: 956 });
    assert.match(embed.description, /باع/u);
    assert.equal(embed.fields.length, 5);
  });

  test('cc shows the balance only (report #122)', async () => {
    const client = { db: { get: async (key, fallback) => fallback, set: async () => true } };
    const embed = await ccProfileEmbed(client, 'g', user);
    assert.match(embed.description, /💰 الرصيد/u);
    assert.equal(embed.fields, undefined);
    assert.doesNotMatch(embed.description, /الترتيب/u);
  });
});
