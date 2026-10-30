import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { HOME_GUILD_ID } from '../src/config/homeGuild.js';
import { getEconomyKey } from '../src/utils/database.js';
import {
  recordStreakMessage, streakBonus, liveStreak, getStreakLeaderboard, handleStreakCommand, resetStreakCache, STREAK,
  ensureStreakChannel, handleStreakMessage, hasStreakMedia, sendDailyReminder, isStreakChannel, STREAK_CHANNEL_ID,
} from '../src/services/cc/streakService.js';

const USER = '200000000000000001';
const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 16, 12);

function setup() {
  const store = new Map();
  const client = {
    db: {
      get: async (key, fallback) => (store.has(key) ? structuredClone(store.get(key)) : fallback),
      set: async (key, value) => { store.set(key, structuredClone(value)); return true; },
      list: async (prefix) => [...store.keys()].filter((key) => key.startsWith(prefix)),
    },
  };
  const ccOf = (guildId = HOME_GUILD_ID) => store.get(getEconomyKey(guildId, USER))?.cc || 0;
  return { client, store, ccOf };
}

describe('daily streak (report #229)', () => {
  beforeEach(() => resetStreakCache());

  test('bonus grows with the streak, is capped, and milestones pay once', () => {
    assert.equal(streakBonus(1).total, STREAK.base);
    assert.equal(STREAK.base, 250);
    assert.equal(streakBonus(STREAK.raiseEvery).daily, STREAK.base);
    assert.equal(streakBonus(STREAK.raiseEvery + 1).daily, STREAK.base + STREAK.raiseBy);
    assert.equal(streakBonus(1000).daily, STREAK.cap);
    assert.equal(streakBonus(7).milestone, STREAK.milestones[7]);
    assert.equal(streakBonus(8).milestone, 0);
  });

  test('one count per day, consecutive days grow it, a missed day starts again at 1', async () => {
    const { client, ccOf } = setup();
    assert.equal((await recordStreakMessage(client, HOME_GUILD_ID, USER, NOW)).count, 1);
    assert.equal(await recordStreakMessage(client, HOME_GUILD_ID, USER, NOW + 1000), null);
    assert.equal(ccOf(), STREAK.base);

    resetStreakCache();
    const second = await recordStreakMessage(client, HOME_GUILD_ID, USER, NOW + DAY);
    assert.equal(second.count, 2);
    assert.equal(ccOf(), STREAK.base * 2);

    const missed = await recordStreakMessage(client, HOME_GUILD_ID, USER, NOW + 3 * DAY);
    assert.equal(missed.count, 1);
    assert.equal(missed.best, 2);
    assert.equal(missed.restarted, true);
  });

  test('day 7 pays the milestone', async () => {
    const { client } = setup();
    let result;
    for (let day = 0; day < 7; day += 1) result = await recordStreakMessage(client, HOME_GUILD_ID, USER, NOW + day * DAY);
    assert.equal(result.count, 7);
    assert.equal(result.milestone, STREAK.milestones[7]);
  });

  test('the board shows running streaks only; the commands answer', async () => {
    const { client } = setup();
    await recordStreakMessage(client, HOME_GUILD_ID, USER, NOW);
    assert.equal(liveStreak({ day: '2026-10-16', count: 3 }, NOW + DAY), 3);
    assert.equal(liveStreak({ day: '2026-10-16', count: 3 }, NOW + 2 * DAY), 0);
    assert.deepEqual((await getStreakLeaderboard(client, HOME_GUILD_ID, NOW)).map((row) => row.userId), [USER]);

    const sent = [];
    const message = { guild: { id: HOME_GUILD_ID, client }, author: { id: USER }, channel: { send: async (payload) => sent.push(payload) } };
    assert.equal(await handleStreakCommand(message, 'ستريك', []), true);
    assert.match(sent[0].content, /ستريك/u);
    assert.equal(await handleStreakCommand(message, 'top', ['streak']), true);
    assert.match(sent[1].embeds[0].title, /Streak/u);
    assert.equal(await handleStreakCommand(message, 'ستريك', ['حلو', 'اوي']), false);
  });

  test('another server keeps nothing of this', async () => {
    const { client, store } = setup();
    assert.equal(await recordStreakMessage(client, '300000000000000001', USER, NOW), null);
    assert.equal(store.size, 0);
    const message = { guild: { id: '300000000000000001', client }, author: { id: USER }, channel: { send: async () => {} } };
    assert.equal(await handleStreakCommand(message, 'ستريك', []), false);
  });
});

describe('streak room: pictures and GIFs only, a reply every time, a daily reminder', () => {
  beforeEach(() => resetStreakCache());
  const ROOM = STREAK_CHANNEL_ID;

  async function room() {
    const base = setup();
    const posted = [];
    const channel = {
      id: ROOM, topic: '', send: async (payload) => { posted.push(payload); return { id: `m${posted.length}` }; },
      permissionOverwrites: { cache: new Map(), edit: async () => {} }, setTopic: async () => {},
    };
    const guild = { id: HOME_GUILD_ID, client: base.client, channels: { cache: new Map([[ROOM, channel]]), fetch: async () => null } };
    base.client.guilds = { cache: new Map([[HOME_GUILD_ID, guild]]) };
    guild.channels.created = [];
    guild.channels.create = async (options) => { guild.channels.created.push(options); return channel; };
    await ensureStreakChannel(guild);
    const message = (extra = {}) => {
      const replies = [];
      return {
        guild, client: base.client, channelId: ROOM, author: { id: USER }, content: '', attachments: new Map(), embeds: [],
        reply: async (payload) => { replies.push(payload); return { delete: async () => {} }; }, react: async () => {}, replies, ...extra,
      };
    };
    return { ...base, guild, posted, message };
  }

  test('pictures and GIF links count, text does not', () => {
    const image = { attachments: new Map([['1', { contentType: 'image/png', name: 'a.png' }]]) };
    assert.equal(hasStreakMedia(image), true);
    assert.equal(hasStreakMedia({ content: 'https://tenor.com/view/happy-123' }), true);
    assert.equal(hasStreakMedia({ embeds: [{ data: { type: 'gifv' } }] }), true);
    assert.equal(hasStreakMedia({ content: 'صباح الخير' }), false);
  });

  test('a picture updates the streak, a second one says it is done today, text is told it does not count', async () => {
    const { message, ccOf } = await room();
    assert.equal(isStreakChannel(ROOM), true);
    const picture = () => message({ attachments: new Map([['1', { contentType: 'image/gif', name: 'x.gif' }]]) });

    const first = picture();
    assert.equal((await handleStreakMessage(first)).count, 1);
    assert.match(first.replies[0].content, /ستريكك اتحدث: \*\*1\*\* يوم/u);
    assert.equal(ccOf(), STREAK.base);

    const again = picture();
    assert.equal(await handleStreakMessage(again), null);
    assert.match(again.replies[0].content, /متحدث النهارده خلاص \(\*\*1\*\* يوم\)/u);

    const text = message({ content: 'ازيكم' });
    await handleStreakMessage(text);
    assert.match(text.replies[0].content, /الكلام مابيتحسبش/u);
    assert.equal(ccOf(), STREAK.base);

    const elsewhere = message({ channelId: '400000000000000001', attachments: picture().attachments });
    assert.equal(await handleStreakMessage(elsewhere), null);
    assert.equal(elsewhere.replies.length, 0);
  });

  test('the evening reminder goes once a day and mentions streaks that would end tonight', async () => {
    const { client, guild, posted } = await room();
    await recordStreakMessage(client, HOME_GUILD_ID, USER, NOW - DAY);
    const evening = NOW - 12 * 60 * 60 * 1000 + (STREAK.reminderHourUtc + 1) * 60 * 60 * 1000;
    assert.equal(await sendDailyReminder(guild, NOW - 12 * 60 * 60 * 1000 + 60 * 60 * 1000), false, 'too early');
    assert.equal(await sendDailyReminder(guild, evening), true);
    assert.match(posted.at(-1).content, /تذكير الستريك/u);
    assert.deepEqual(posted.at(-1).allowedMentions.users, [USER]);
    assert.equal(await sendDailyReminder(guild, evening + 60 * 1000), false, 'once a day');
  });

  test('the room is the fixed one: found by its ID, never made again, and it works before startup', async () => {
    assert.equal(STREAK_CHANNEL_ID, '1562578413217124402');
    const { guild } = await room();
    assert.equal((await ensureStreakChannel(guild)).id, STREAK_CHANNEL_ID);
    assert.equal(guild.channels.created.length, 0);

    // The room can't be fetched right now (Discord hiccup, or it was deleted): nothing is created.
    guild.channels.cache.clear();
    assert.equal(await ensureStreakChannel(guild), null);
    assert.equal(guild.channels.created.length, 0);
    assert.equal(isStreakChannel(STREAK_CHANNEL_ID), true);
  });
});
