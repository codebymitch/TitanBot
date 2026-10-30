import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { isMilestone, progressBar, buildLevelUpMessage, buildRankEmbed, buildTopEmbed } from '../src/services/leveling/levelUi.js';
import { rollXp } from '../src/services/leveling/messageXp.js';

const member = { id: '42', displayName: 'زتونه', toString: () => '<@42>', displayAvatarURL: () => 'https://cdn/a.png' };

describe('level system', () => {
  test('only every 5th level pings', () => {
    assert.equal(isMilestone(3, 4), false);
    assert.equal(isMilestone(4, 5), true);
    assert.equal(isMilestone(8, 11), true); // jumped over 10
    assert.equal(isMilestone(10, 11), false);
  });

  test('a normal level-up shows the mention without pinging', () => {
    const message = buildLevelUpMessage(member, { fromLevel: 6, level: 7, xp: 10, xpNeeded: 400 });
    assert.equal(message.content, null);
    assert.deepEqual(message.allowedMentions, { parse: [] });
    assert.match(message.embeds[0].description, /<@42> وصل \*\*لفل 7\*\*/u);
    assert.match(message.embeds[0].footer.text, /لفل 10/u);
  });

  test('every 5 levels the member is pinged', () => {
    const message = buildLevelUpMessage(member, { fromLevel: 9, level: 10, xp: 0, xpNeeded: 1050, rewardRoleIds: ['99'] });
    assert.equal(message.content, '<@42>');
    assert.deepEqual(message.allowedMentions, { users: ['42'] });
    assert.match(message.embeds[0].title, /لفل 10/u);
    assert.match(message.embeds[0].description, /<@&99>/u);
  });

  test('progress bar and cards', () => {
    assert.equal(progressBar(50, 100, 10), '▰▰▰▰▰▱▱▱▱▱ 50%');
    assert.equal(progressBar(500, 100, 4), '▰▰▰▰ 100%');
    const rank = buildRankEmbed(member, { level: 3, xp: 40, totalXp: 900, xpNeeded: 245, position: 2, rankedCount: 8 });
    assert.equal(rank.fields[1].value, '**#2** من 8');
    const top = buildTopEmbed({ name: 'void' }, [{ userId: '1', level: 9, totalXp: 5000 }, { userId: '2', level: 4, totalXp: 900 }], { callerId: '3', callerEntry: null });
    assert.match(top.description, /🥇 <@1> — لفل \*\*9\*\*/u);
    assert.match(top.description, /لسه ما جمعتش XP/u);
  });

  test('chat XP stays within the configured range and multiplier', () => {
    assert.equal(rollXp({ xpPerMessage: { min: 15, max: 25 } }, () => 0), 15);
    assert.equal(rollXp({ xpPerMessage: { min: 15, max: 25 } }, () => 0.999), 25);
    assert.equal(rollXp({ xpPerMessage: { min: 10, max: 10 }, xpMultiplier: 2 }, () => 0.5), 20);
  });
});

import { applyWordAliases, resolveCommandAlias } from '../src/config/commands/commandAliases.js';
import { mapArgumentsToOptions } from '../src/utils/prefixParser.js';
import leaderboardCommand from '../src/commands/Leveling/leaderboard.js';
import rankCommand from '../src/commands/Leveling/rank.js';
import { countMessage, flushChatCounts, getChatCounts, rankChatCounts, chatCountKey } from '../src/services/leveling/chatCounter.js';
import { buildTopChatEmbed } from '../src/services/leveling/levelUi.js';

function typed(text) {
  const [word, ...args] = text.split(' ');
  const aliased = applyWordAliases(word.toLowerCase(), args, false);
  if (!aliased) return null;
  return { command: resolveCommandAlias(aliased.commandName), args: aliased.args };
}

describe('level words and top chat', () => {
  test('top chat / top level / توب شات / توب لفل pick the right leaderboard', () => {
    for (const [text, type] of [['top chat', 'chat'], ['top level', 'level'], ['توب شات', 'chat'], ['توب الشات', 'chat'], ['توب لفل', 'level'], ['توب الليفلات', 'level'], ['توب ليفلات', 'level'], ['توب اللفلات', 'level']]) {
      const { command, args } = typed(text);
      assert.equal(command, 'leaderboard');
      assert.equal(mapArgumentsToOptions(args, leaderboardCommand.data).getString('type'), type);
    }
    assert.equal(typed('توب').command, 'leaderboard');
  });

  test('لفل @member shows that member, and chat like "لفل كام" is ignored', () => {
    const { command, args } = typed('لفل <@123456789012345678>');
    assert.equal(command, 'rank');
    assert.equal(mapArgumentsToOptions(args, rankCommand.data).getUser('user'), '<@123456789012345678>');
    assert.equal(typed('لفل كام يا جماعة'), null);
  });

  test('messages are counted, saved in batches and ranked', async () => {
    const store = new Map();
    const client = { db: { get: async (key, fallback) => (store.has(key) ? store.get(key) : fallback), set: async (key, value) => store.set(key, value) } };
    for (let i = 0; i < 3; i += 1) countMessage(client, 'g-test', 'a');
    countMessage(client, 'g-test', 'b');
    assert.deepEqual(await getChatCounts(client, 'g-test'), { a: 3, b: 1 });
    await flushChatCounts(client);
    assert.deepEqual(store.get(chatCountKey('g-test')), { a: 3, b: 1 });
    countMessage(client, 'g-test', 'b');
    assert.deepEqual(await getChatCounts(client, 'g-test'), { a: 3, b: 2 });
    const ranked = rankChatCounts({ a: 3, b: 2, gone: 9 }, (id) => id !== 'gone');
    assert.deepEqual(ranked.map((entry) => [entry.userId, entry.rank]), [['a', 1], ['b', 2]]);
    const embed = buildTopChatEmbed({ name: 'void' }, ranked, { callerId: 'b', callerEntry: ranked[1] });
    assert.match(embed.description, /🥇 <@a> — \*\*3\*\* رسالة/u);
    assert.match(embed.description, /ترتيبك:\*\* #2/u);
  });
});

describe('level-up message source', () => {
  test('chat and voice level-ups look different and show both totals', () => {
    const chat = buildLevelUpMessage(member, { fromLevel: 6, level: 7, xp: 10, xpNeeded: 400, source: 'chat', messages: 1234, voiceMinutes: 125 });
    const voice = buildLevelUpMessage(member, { fromLevel: 6, level: 7, xp: 10, xpNeeded: 400, source: 'voice', messages: 1234, voiceMinutes: 125 });
    assert.equal(chat.embeds[0].title, '💬 لفل 7 من الشات');
    assert.equal(voice.embeds[0].title, '🎙️ لفل 7 من الفويس');
    assert.notEqual(chat.embeds[0].color, voice.embeds[0].color);
    assert.match(chat.embeds[0].description, /من الكلام في الشات/u);
    assert.match(voice.embeds[0].description, /من القعدة في الفويس/u);
    assert.match(chat.embeds[0].description, /الرسايل: \*\*1,234\*\*/u);
    assert.match(chat.embeds[0].description, /الفويس: \*\*2س 5د\*\*/u);
  });

  test('a milestone keeps the ping and still shows the source', () => {
    const message = buildLevelUpMessage(member, { fromLevel: 9, level: 10, xp: 0, xpNeeded: 1050, source: 'voice' });
    assert.equal(message.content, '<@42>');
    assert.match(message.embeds[0].title, /لفل 10 🎙️/u);
  });
});

import { getLeaderboard } from '../src/services/leveling/leveling.js';
import { getUserLevelKey } from '../src/utils/database/keys.js';

describe('level leaderboard', () => {
  const GUILD = '100000000000000001';
  const ids = { oskar: '200000000000000001', other: '200000000000000002', bot: '200000000000000003', left: '200000000000000004' };

  function makeClient({ fetchFails }) {
    const store = new Map([
      [getUserLevelKey(GUILD, ids.oskar), { level: 12, xp: 0, totalXp: 6430 }],
      [getUserLevelKey(GUILD, ids.other), { level: 3, xp: 10, totalXp: 400 }],
      [getUserLevelKey(GUILD, ids.bot), { level: 20, xp: 0, totalXp: 99999 }],
      [getUserLevelKey(GUILD, ids.left), { level: 30, xp: 0, totalXp: 50000 }],
    ]);
    const member = (id, bot = false) => [id, { user: { id, bot, username: id } }];
    const all = new Map([member(ids.oskar), member(ids.other), member(ids.bot, true)]);
    const guild = {
      id: GUILD,
      memberCount: all.size,
      members: {
        // Only the caller is cached, like right after a `rank`.
        cache: new Map([member(ids.oskar)]),
        fetch: async () => { if (fetchFails) throw new Error('rate limited'); return all; },
      },
    };
    return {
      guilds: { cache: new Map([[GUILD, guild]]) },
      db: {
        get: async (key) => store.get(key) ?? null,
        list: async (prefix) => [...store.keys()].filter((key) => key.startsWith(prefix)),
      },
    };
  }

  test('ranks members by XP, without bots or people who left', async () => {
    const board = await getLeaderboard(makeClient({ fetchFails: false }), GUILD, 10);
    assert.deepEqual(board.map((entry) => [entry.userId, entry.rank, entry.level]), [[ids.oskar, 1, 12], [ids.other, 2, 3]]);
  });

  test('still shows the top when Discord refuses the member fetch', async () => {
    const board = await getLeaderboard(makeClient({ fetchFails: true }), GUILD, 10);
    assert.ok(board.some((entry) => entry.userId === ids.oskar && entry.totalXp === 6430));
    assert.ok(board.length > 0);
  });
});
