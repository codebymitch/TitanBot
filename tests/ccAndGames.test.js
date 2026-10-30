import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { HOME_GUILD_ID } from '../src/config/homeGuild.js';
import {
    groupRewards, soloRewardLeft, grantCC, awardGroupGame, awardSoloWin, spendCC, adjustCC, getProfile, getLeaderboard,
} from '../src/services/cc/ccService.js';
import { validateStoreItem, buyItem } from '../src/services/cc/ccStoreService.js';
import { CC } from '../src/config/cc.js';
import { normalizeAnswer, isAnswer } from '../src/services/games/text.js';
import { splitLetters, scrambleWord, gameWords } from '../src/services/games/data/words.js';
import { triviaQuestions } from '../src/services/games/data/trivia.js';
import { rankScores, judgeGuess, makeMathQuestion, ROUND_GAMES, GUESS_NUMBER } from '../src/services/games/roundGames.js';
import { resolveRouletteChoice } from '../src/services/games/roulette.js';
import { rankChairs, planRound, chairButton } from '../src/services/games/chairs.js';
import { assignRoles, checkWinner, tallyVotes, kickAfk, PHASE_MS } from '../src/services/games/mafia.js';
import { isSlotsWin } from '../src/services/games/solo.js';
import { claimChannel, releaseChannel, getActiveGame } from '../src/services/games/session.js';
import { commandArgAliases, standaloneOnlyAliases, isStandaloneInvocation, twoWordCommandAliases } from '../src/config/commands/commandAliases.js';
import gameCommand from '../src/commands/Games/game.js';
import soloCommand from '../src/commands/Games/solo.js';
import storeCommand from '../src/commands/Games/store.js';
import bourseCommand from '../src/commands/Games/bourse.js';

// These tests check the normal reward rules; a running CC event (CC.boost) is tested on its own.
CC.boost = { multiplier: 1, until: null };

// Our server: the store only sells its items there (src/config/homeGuild.js).
const GUILD = HOME_GUILD_ID;
const A = '200000000000000001';
const B = '200000000000000002';
const C = '200000000000000003';
const D = '200000000000000004';

function fakeClient() {
    const store = new Map();
    return {
        store,
        db: {
            get: async (key, fallback = null) => (store.has(key) ? structuredClone(store.get(key)) : fallback),
            set: async (key, value) => { store.set(key, structuredClone(value)); return true; },
            list: async (prefix) => [...store.keys()].filter((key) => key.startsWith(prefix)),
        },
    };
}

describe('CC rewards', () => {
    test('group rewards grow with players, pay fewer places than players and stop growing at the cap', () => {
        assert.deepEqual(groupRewards(1), []);
        assert.deepEqual(groupRewards(2), [10]);
        assert.deepEqual(groupRewards(3), [15, 9]);
        assert.deepEqual(groupRewards(10), [50, 30, 20]);
        assert.deepEqual(groupRewards(30), [150, 90, 60]);
        assert.deepEqual(groupRewards(80), groupRewards(30));
    });

    test('solo wins have no daily cap outside a CC event', () => {
        assert.equal(CC.solo.dailyCap, null);
        assert.equal(soloRewardLeft(0), CC.solo.win);
        assert.equal(soloRewardLeft(1_000_000), CC.solo.win);
    });
});

describe('CC service', () => {
    test('group games pay the top places and count the game for everyone', async () => {
        const client = fakeClient();
        const paid = await awardGroupGame(client, GUILD, { game: 'trivia', ranking: [B, A, C, D], playerIds: [A, B, C, D] });
        assert.deepEqual(paid.map((w) => [w.userId, w.place, w.amount]), [[B, 1, 20], [A, 2, 12], [C, 3, 8]]);
        const b = await getProfile(client, GUILD, B);
        assert.equal(b.cc, 20);
        assert.equal(b.stats.groupWins, 1);
        const d = await getProfile(client, GUILD, D);
        assert.equal(d.cc, 0);
        assert.equal(d.stats.gamesPlayed, 1);
        const board = await getLeaderboard(client, GUILD);
        assert.deepEqual(board.map((row) => row.userId), [B, A, C]);
    });

    test('solo wins keep paying outside a CC event', async () => {
        const client = fakeClient();
        const day = Date.UTC(2026, 0, 1, 12);
        let total = 0;
        for (let i = 0; i < 15; i += 1) total += (await awardSoloWin(client, GUILD, A, 'slots', { now: day })).amount;
        assert.equal(total, CC.solo.win * 15);
    });

    test('spending needs enough CC and staff adjustments never go below zero', async () => {
        const client = fakeClient();
        await adjustCC(client, GUILD, A, 50, 'staff');
        assert.equal((await spendCC(client, GUILD, A, 80)).ok, false);
        const spent = await spendCC(client, GUILD, A, 30, 'test');
        assert.deepEqual([spent.ok, spent.balance, spent.stats.spent], [true, 20, 30]);
        const removed = await adjustCC(client, GUILD, A, -500, 'staff');
        assert.equal(removed.balance, 0);
    });

    test('keeps the old economy fields untouched', async () => {
        const client = fakeClient();
        client.store.set(`guild:${GUILD}:economy:${A}`, { wallet: 999, bank: 5 });
        await grantCC(client, GUILD, A, 10);
        const record = client.store.get(`guild:${GUILD}:economy:${A}`);
        assert.deepEqual([record.wallet, record.bank, record.cc], [999, 5, 10]);
    });
});

describe('CC store', () => {
    const role = { id: 'vip', name: 'VIP', price: 100, type: 'role', roleId: '300000000000000001' };
    const item = { id: 'ticket', name: 'Ticket', price: 40, type: 'item', maxOwned: 2 };

    test('validates catalog items', () => {
        assert.deepEqual(validateStoreItem(role), []);
        assert.deepEqual(validateStoreItem(item), []);
        assert.ok(validateStoreItem({ id: 'Bad Id', name: '', price: 0, type: 'x' }).length >= 4);
        assert.ok(validateStoreItem({ id: 'r', name: 'r', price: 5, type: 'role' }).some((p) => p.includes('roleId')));
    });

    test('buys items and roles with CC', async () => {
        const client = fakeClient();
        const roles = new Set();
        const member = { id: A, guild: { id: GUILD }, roles: { cache: { has: (id) => roles.has(id) }, add: async (id) => { roles.add(id); } } };
        const options = { items: [role, item], settings: { open: true, maxQuantity: 10 } };

        assert.equal((await buyItem(client, member, 'vip', 1, { ...options, settings: { open: false } })).reason, 'closed');
        await adjustCC(client, GUILD, A, 150, 'staff');
        assert.equal((await buyItem(client, member, 'nope', 1, options)).reason, 'not_found');
        const bought = await buyItem(client, member, 'vip', 1, options);
        assert.deepEqual([bought.ok, bought.balance, roles.has(role.roleId)], [true, 50, true]);
        assert.equal((await buyItem(client, member, 'vip', 1, options)).reason, 'owned');
        assert.equal((await buyItem(client, member, 'ticket', 3, options)).reason, 'max_owned');
        assert.equal((await buyItem(client, member, 'ticket', 2, options)).reason, 'no_cc');
        assert.equal((await buyItem(client, member, 'ticket', 1, options)).ok, true);
        assert.equal((await getProfile(client, GUILD, A)).inventory.ticket, 1);
    });
});

describe('game helpers', () => {
    test('answers match without tashkeel, hamza or ة/ه differences', () => {
        assert.equal(normalizeAnswer('  القاهرةُ  '), 'القاهره');
        assert.ok(isAnswer('أسد', ['اسد']));
        assert.ok(isAnswer('٢٠٦', ['206']));
        assert.ok(!isAnswer('', ['']));
        assert.ok(!isAnswer('القاهرة الجديدة', ['القاهرة']));
    });

    test('word games', () => {
        assert.equal(splitLetters('سيارة'), 'س ي ا ر ة');
        for (const word of gameWords) assert.notEqual(scrambleWord(word).replace(/ /gu, ''), word.replace(/ /gu, ''));
        assert.ok(triviaQuestions.every((q) => q.q && q.a.length));
    });

    test('round games rank by points, then by who got there first', () => {
        const scores = new Map([[A, { points: 2, reachedAt: 50 }], [B, { points: 3, reachedAt: 90 }], [C, { points: 2, reachedAt: 10 }], [D, { points: 0, reachedAt: 0 }]]);
        assert.deepEqual(rankScores(scores), [B, C, A]);
    });

    test('guess the number hints and ignores chat', () => {
        assert.equal(judgeGuess('50', 70, 1, 100), 'higher');
        assert.equal(judgeGuess('٩٠', 70, 1, 100), 'lower');
        assert.equal(judgeGuess('70', 70, 1, 100), true);
        assert.equal(judgeGuess('هاي', 70, 1, 100), null);
        assert.equal(judgeGuess('500', 70, 1, 100), null);
        assert.equal(judgeGuess('0', 70, 0, 200), 'higher');
        assert.equal(judgeGuess('200', 70, 0, 200), 'lower');
        assert.equal(judgeGuess('201', 70, 0, 200), null);
    });

    test('guess the number is 0 to 200 with 7 tries per player', () => {
        assert.deepEqual(GUESS_NUMBER, { min: 0, max: 200, tries: 7 });
        const [round] = ROUND_GAMES.guess.makeRounds(1);
        const target = Number(round.reveal);
        assert.ok(target >= 0 && target <= 200);
        assert.equal(round.maxTries, 7);
        assert.equal(round.judge(round.reveal), true);
    });

    test('math questions have the right answers', () => {
        for (let i = 0; i < 50; i += 1) {
            const { text, answer } = makeMathQuestion();
            const [a, op, b] = text.split(' ');
            const expected = op === '+' ? Number(a) + Number(b) : op === '-' ? Number(a) - Number(b) : Number(a) * Number(b);
            assert.equal(answer, expected);
            assert.ok(answer >= 0);
        }
    });

    test('every round game makes the rounds it is asked for', () => {
        for (const game of Object.values(ROUND_GAMES)) {
            const rounds = game.makeRounds(3);
            assert.equal(rounds.length, 3);
            for (const round of rounds) assert.equal(round.judge(round.reveal), true);
        }
    });

    test('roulette picks, random and withdraw', () => {
        const alive = [{ id: A }, { id: B }, { id: C }];
        assert.equal(resolveRouletteChoice(`roulette_kick_${B}`, alive, alive[0]).id, B);
        assert.equal(resolveRouletteChoice('roulette_quit', alive, alive[0]).id, A);
        assert.equal(resolveRouletteChoice(null, alive, alive[0]).id, A);
        assert.equal(resolveRouletteChoice('roulette_random', alive, alive[0], (list) => list[1]).id, C);
    });

    test('chairs ranks survivors, then the latest losers', () => {
        assert.deepEqual(rankChairs([A], [[D], [C], [B]]), [A, B, C, D]);
    });

    test('chairs: grey chairs can not be pressed, red and green can, timing is random', () => {
        assert.equal(chairButton(0, 'wait').data.disabled, true);
        assert.equal(chairButton(0, 'done').data.disabled, true);
        assert.deepEqual([chairButton(0, 'red').data.disabled, chairButton(0, 'red').data.style], [false, 4]);
        assert.deepEqual([chairButton(0, 'green').data.disabled, chairButton(0, 'green').data.style], [false, 3]);
        assert.equal(chairButton(0, 'green', { username: 'sam' }).data.disabled, true);
        assert.equal(chairButton(0, 'green', { username: 'sam' }).data.label, 'sam');

        assert.deepEqual(planRound(() => 0), { flashes: [], greenAfterMs: 2000 });
        const busy = planRound(() => 0.99999999);
        assert.equal(busy.flashes.length, 2);
        assert.deepEqual(busy.flashes[0], { waitMs: 6000, redMs: 3000 });
        assert.equal(busy.greenAfterMs, 7000);
        const timings = new Set(Array.from({ length: 30 }, () => planRound().greenAfterMs));
        assert.ok(timings.size > 1, 'green comes at a different moment each round');
    });

    test('mafia roles, winner and votes', () => {
        const ids = Array.from({ length: 8 }, (_, i) => `id${i}`);
        const roles = assignRoles(ids, (list) => list);
        const counts = [...roles.values()].reduce((acc, role) => ({ ...acc, [role]: (acc[role] || 0) + 1 }), {});
        assert.deepEqual(counts, { mafia: 2, doctor: 1, detective: 1, citizen: 4 });
        assert.equal(assignRoles(ids.slice(0, 5)).size, 5);
        assert.equal(checkWinner(roles, ['id2', 'id3']), 'town');
        assert.equal(checkWinner(roles, ['id0', 'id5']), 'mafia');
        assert.equal(checkWinner(roles, ['id0', 'id4', 'id5']), null);
        assert.equal(tallyVotes(new Map([[A, B], [C, B], [D, A]])), B);
        assert.equal(tallyVotes(new Map([[A, B], [C, A]])), null);
        assert.equal(tallyVotes(new Map([[A, 'skip'], [C, 'skip'], [D, A]])), null);
        assert.equal(tallyVotes(new Map([[A, B], [C, A]]), { allowTie: true, random: (list) => list[0] }), B);
    });

    test('mafia kicks AFK players, shows their role and never pays them', () => {
        assert.equal(PHASE_MS, 20_000);
        const roles = new Map([[A, 'mafia'], [B, 'doctor'], [C, 'citizen'], [D, 'citizen']]);
        const state = { roles, alive: [A, B, C, D], dead: [], afk: new Set() };
        const line = kickAfk(state, [B, D]);
        assert.deepEqual(state.alive, [A, C]);
        assert.deepEqual([...state.afk], [B, D]);
        assert.deepEqual(state.dead, []);
        assert.ok(line.includes('AFK') && line.includes('دكتور'));
        assert.equal(kickAfk(state, []), '');
        assert.equal(checkWinner(roles, state.alive), 'mafia');
    });

    test('slots win on three of a kind', () => {
        assert.ok(isSlotsWin(['💎', '💎', '💎']));
        assert.ok(!isSlotsWin(['💎', '💎', '🍒']));
    });

    test('one game per channel', () => {
        const session = claimChannel('chan', 'trivia', A);
        assert.ok(session);
        assert.equal(claimChannel('chan', 'roulette', B), null);
        assert.equal(getActiveGame('chan').game, 'trivia');
        releaseChannel(session);
        assert.equal(getActiveGame('chan'), null);
    });
});

describe('game words', () => {
    test('every alias points at a real subcommand', () => {
        const subcommands = {
            game: gameCommand.data.toJSON().options.map((o) => o.name),
            solo: soloCommand.data.toJSON().options.map((o) => o.name),
            store: storeCommand.data.toJSON().options.map((o) => o.name),
            bourse: bourseCommand.data.toJSON().options.map((o) => o.name),
        };
        for (const [word, target] of Object.entries(commandArgAliases)) {
            const [command, sub] = target.split(' ');
            assert.ok(subcommands[command]?.includes(sub), `${word} → ${target}`);
            assert.ok(standaloneOnlyAliases.has(word));
        }
        assert.equal(twoWordCommandAliases['top cc'], 'cctop');
    });

    test('everyday words only run on their own, with a number or a mention', () => {
        assert.ok(isStandaloneInvocation([]));
        assert.ok(isStandaloneInvocation(['5']));
        assert.ok(isStandaloneInvocation([`<@${A}>`]));
        assert.ok(!isStandaloneInvocation(['يا', 'جماعة']));
    });
});
