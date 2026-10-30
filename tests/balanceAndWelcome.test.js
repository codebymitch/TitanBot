import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildStorePanel } from '../src/services/cc/storeUi.js';
import { holdingsEmbed, pricesEmbed } from '../src/services/cc/bourseUi.js';
import { HOME_GUILD_ID } from '../src/config/homeGuild.js';
import { CHAOS_GUILD_ID, WELCOME_CHANNEL_ID } from '../src/config/inviteRewards.js';
import welcome from '../src/events/voidWelcome.js';
import { PermissionsBitField } from 'discord.js';

describe('balance on متجر and ممتلكاتي (report #174)', () => {
  test('the store panel shows the member\'s balance only when given', () => {
    const guild = { id: HOME_GUILD_ID };
    assert.match(buildStorePanel(guild, { balance: 12345 }).embeds[0].description, /💰 رصيدك: \*\*12,345\*\*/u);
    assert.doesNotMatch(buildStorePanel(guild).embeds[0].description || '', /رصيدك/u);
  });

  test('prices: the balance replaces the 🔥 demand mark and its legend; without a balance nothing changes', () => {
    const asset = { emoji: '🚗', name: 'عربية' };
    const market = { quotes: [{ asset, price: 1300, changePercent: 2, raised: true }], nextChangeAt: Date.now() + 1000 };
    const ours = pricesEmbed(market, { balance: 12345 });
    assert.equal(ours.footer.text.includes('🔥'), false);
    assert.match(ours.footer.text, /💰 رصيدك: 12,345 CC/u);
    assert.equal(ours.fields[0].value.includes('🔥'), false);
    const old = pricesEmbed(market);
    assert.match(old.footer.text, /🔥 = عليها طلب/u);
    assert.match(old.fields[0].value, /🔥/u);
  });

  test('holdings show the balance, with or without assets', () => {
    const user = { toString: () => '<@u>' };
    const empty = holdingsEmbed(user, { rows: [], totalValue: 0, totalPaid: 0, totalIfSold: 0 }, { balance: 500 });
    assert.equal(empty.fields.at(-1).name, '💰 رصيدك');
    const asset = { emoji: '🚗', name: 'عربية' };
    const full = holdingsEmbed(user, { rows: [{ asset, qty: 1, paid: 1000, value: 1100, ifSold: 1080, profit: 80 }], totalValue: 1100, totalPaid: 1000, totalIfSold: 1080 }, { balance: 42 });
    assert.match(full.fields.at(-1).value, /42/u);
    assert.ok(!holdingsEmbed(user, { rows: [], totalValue: 0, totalPaid: 0, totalIfSold: 0 }).fields);
  });
});

describe('welcome message (report #175)', () => {
  test('uses the bot\'s own copy of the emoji, uploaded once, or 👋 until then (report #177)', async () => {
    const { ensureWelcomeEmoji, getWelcomeEmoji, WELCOME_EMOJI_URL } = await import('../src/services/welcomeEmojiService.js');
    assert.equal(getWelcomeEmoji({}), '👋');
    const created = [];
    const store = new Map();
    const client = { application: { emojis: {
      cache: store,
      fetch: async () => store,
      create: async ({ attachment, name }) => { created.push(attachment); const e = { name, toString: () => '<a:smileywave:999>' }; store.set('999', e); return e; },
    } } };
    assert.equal(await ensureWelcomeEmoji(client), '<a:smileywave:999>');
    assert.equal(await ensureWelcomeEmoji(client), '<a:smileywave:999>');
    assert.deepEqual(created, [WELCOME_EMOJI_URL]);
    assert.equal(getWelcomeEmoji(client), '<a:smileywave:999>');
  });

  test('ends with the waving emoji', async () => {
    const sent = [];
    const channel = { isTextBased: () => true, permissionsFor: () => new PermissionsBitField(PermissionsBitField.All), send: async (payload) => { sent.push(payload); } };
    const member = {
      id: '200000000000000001',
      toString: () => '<@200000000000000001>',
      user: { bot: false, tag: 'new' },
      guild: { id: CHAOS_GUILD_ID, members: { me: {} }, channels: { cache: new Map([[WELCOME_CHANNEL_ID, channel]]) }, invites: { fetch: async () => new Map() } },
    };
    await welcome.execute(member);
    assert.equal(sent[0].content, 'welcome to chaos <@200000000000000001> <a:smileywave:999>');
  });
});
