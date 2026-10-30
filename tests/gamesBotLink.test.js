import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { gamesEnabled, isDisabledGameCommand, GAMES_MOVED_NOTICE } from '../src/config/games.js';
import { GAMES_CHANNEL_ID, handleGamesChannelMessage, isGamesOnlyFor, isBlockedSlashCommand } from '../src/services/games/gamesChannel.js';
import gamesPanelButton from '../src/interactions/buttons/games/gamesPanel.js';
import { createCCApiRouter, isAuthorized } from '../src/services/cc/ccApi.js';
import { getProfile } from '../src/services/cc/ccService.js';
import { CC } from '../src/config/cc.js';

// These tests check the normal reward rules; a running CC event (CC.boost) is tested on its own.
CC.boost = { multiplier: 1, until: null };

const GUILD = '100000000000000001';
const A = '200000000000000001';
const B = '200000000000000002';
const C = '200000000000000003';
const TOKEN = 'test-token-0123456789abcdef';

function memoryDb() {
    const data = new Map();
    return {
        data,
        get: async (key, fallback) => (data.has(key) ? structuredClone(data.get(key)) : fallback),
        set: async (key, value) => { data.set(key, structuredClone(value)); return true; },
        list: async (prefix) => [...data.keys()].filter((key) => key.startsWith(prefix)),
    };
}

describe('games are off by default', () => {
    const previous = process.env.GAMES_ENABLED;
    before(() => { delete process.env.GAMES_ENABLED; });
    after(() => { if (previous !== undefined) process.env.GAMES_ENABLED = previous; });

    test('the switch', () => {
        assert.equal(gamesEnabled(), false);
        assert.equal(isDisabledGameCommand('game'), true);
        assert.equal(isDisabledGameCommand('cc'), false);
        process.env.GAMES_ENABLED = 'true';
        assert.equal(isDisabledGameCommand('game'), false);
        delete process.env.GAMES_ENABLED;
    });

    test('game commands are not loaded, the CC commands are', async () => {
        const { loadCommands } = await import('../src/handlers/loaders/commandLoader.js');
        const loaded = {};
        await loadCommands(loaded);
        for (const name of ['game', 'solo', 'rps', 'xo', 'fight']) assert.equal(loaded.commands.has(name), false, name);
        assert.equal(loaded.commands.has('daily'), false);
        for (const name of ['cc', 'cctop']) assert.equal(loaded.commands.get(name).category, 'Games', name);
    });

    test('the games channel is left alone for the games bot', async () => {
        let deleted = false;
        const message = {
            content: 'انا جاي العب',
            channelId: GAMES_CHANNEL_ID,
            guild: { id: GUILD },
            author: { id: A, bot: false },
            client: { user: { id: '999999999999999999' } },
            delete: async () => { deleted = true; },
            channel: { send: async () => ({ delete: async () => {} }) },
        };
        assert.equal(await handleGamesChannelMessage(message, { db: memoryDb() }), false);
        assert.equal(deleted, false);
        assert.equal(isGamesOnlyFor(message), false);
        assert.equal(isBlockedSlashCommand(GAMES_CHANNEL_ID, 'ban', A), false);
    });

    test('old panel game buttons say the games moved', async () => {
        const replies = [];
        const interaction = {
            inGuild: () => true,
            user: { id: A },
            reply: async (payload) => { replies.push(payload); },
        };
        await gamesPanelButton.execute(interaction, {}, ['roulette']);
        await gamesPanelButton.execute(interaction, {}, ['stop']);
        assert.equal(replies.length, 2);
        assert.equal(replies[0].content, GAMES_MOVED_NOTICE);
    });
});

describe('CC API for the games bot', () => {
    let server;
    let base;
    let db;
    let token = TOKEN;

    before(async () => {
        db = memoryDb();
        const client = { db, guilds: { cache: new Map([[GUILD, {}]]) } };
        const app = express();
        app.use('/api/cc', createCCApiRouter(client, { token: () => token }));
        await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
        base = `http://127.0.0.1:${server.address().port}/api/cc`;
    });
    after(() => new Promise((resolve) => server.close(resolve)));

    const call = async (method, path, body, auth = `Bearer ${TOKEN}`) => {
        const res = await fetch(`${base}${path}`, {
            method,
            headers: { 'content-type': 'application/json', ...(auth ? { authorization: auth } : {}) },
            ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
        });
        return { status: res.status, body: await res.json() };
    };

    test('token checks', async () => {
        assert.equal(isAuthorized(`Bearer ${TOKEN}`, TOKEN), true);
        assert.equal(isAuthorized('Bearer nope', TOKEN), false);
        assert.equal(isAuthorized(`Bearer short`, 'short'), false);
        assert.equal((await call('GET', `/${GUILD}/users/${A}`, undefined, null)).status, 401);
        assert.equal((await call('GET', `/${GUILD}/users/${A}`, undefined, 'Bearer wrong-token-xxxxxxxx')).status, 401);
        token = '';
        assert.equal((await call('GET', `/${GUILD}/users/${A}`)).status, 503);
        token = TOKEN;
    });

    test('unknown guilds and bad input are refused', async () => {
        assert.equal((await call('GET', `/100000000000000999/users/${A}`)).status, 404);
        assert.equal((await call('POST', `/${GUILD}/add`, { userId: 'abc', amount: 5 })).status, 400);
        assert.equal((await call('POST', `/${GUILD}/add`, { userId: A, amount: 0 })).status, 400);
        assert.equal((await call('POST', `/${GUILD}/add`, { userId: A, amount: 1_000_000 })).status, 400);
        assert.equal((await call('POST', `/${GUILD}/add`, '{broken')).status, 400);
        assert.equal((await call('POST', `/${GUILD}/group-game`, { players: [A, B], ranking: [C] })).status, 400);
    });

    test('group game pays the top places with our reward rules', async () => {
        const res = await call('POST', `/${GUILD}/group-game`, { game: 'roulette', players: [A, B, C], ranking: [B, A] });
        assert.equal(res.status, 200);
        assert.deepEqual(res.body.paid.map((p) => [p.userId, p.amount]), [[B, 15], [A, 9]]);
        const c = await getProfile({ db }, GUILD, C);
        assert.equal(c.cc, 0);
        assert.equal(c.stats.gamesPlayed, 1);
    });

    test('add, spend, solo win, profile and top', async () => {
        const before = (await call('GET', `/${GUILD}/users/${C}`)).body.cc;
        assert.equal((await call('POST', `/${GUILD}/add`, { userId: C, amount: 40, reason: 'event' })).body.balance, before + 40);
        const solo = await call('POST', `/${GUILD}/solo-win`, { userId: C, game: 'xo' });
        assert.equal(solo.body.amount, 5);
        assert.deepEqual((await call('POST', `/${GUILD}/spend`, { userId: C, amount: 1000 })).body, { ok: false, balance: before + 45 });
        assert.deepEqual((await call('POST', `/${GUILD}/spend`, { userId: C, amount: 45 })).body, { ok: true, balance: before });
        const top = await call('GET', `/${GUILD}/top?limit=2`);
        assert.equal(top.body.top.length, 2);
        assert.equal(top.body.top[0].userId, B);
    });

    test('a retried requestId never pays twice', async () => {
        const body = { userId: A, amount: 7, requestId: 'win-123' };
        const [first, second] = await Promise.all([call('POST', `/${GUILD}/add`, body), call('POST', `/${GUILD}/add`, body)]);
        assert.deepEqual(first.body, second.body);
        const third = await call('POST', `/${GUILD}/add`, body);
        assert.deepEqual(third.body, first.body);
        assert.equal((await getProfile({ db }, GUILD, A)).cc, 9 + 7);
    });
});

describe('games bot (Clover) wins', async () => {
    const { handleGamesBotWin, parseWinner } = await import('../src/services/cc/gamesBotWins.js');
    const { CLOVER_BOT_ID } = await import('../src/config/games.js');
    let nextId = 1;

    function winMessage(content, { authorId = CLOVER_BOT_ID, bot = true, winnerBot = false, id = String(nextId++) } = {}) {
        const replies = [];
        const winnerId = parseWinner(content);
        return {
            id,
            content,
            guild: { id: GUILD },
            author: { id: authorId, bot },
            mentions: { users: new Map(winnerId ? [[winnerId, { id: winnerId, bot: winnerBot }]] : []) },
            reply: async (payload) => { replies.push(payload); return { delete: async () => {} }; },
            replies,
        };
    }

    test('reads the winner from the crown message', () => {
        assert.equal(parseWinner(`👑 | <@${A}>`), A);
        assert.equal(parseWinner(`👑 | <@!${A}>`), A);
        assert.equal(parseWinner(`👑 | <@${A}> <@${B}>`), null);
        assert.equal(parseWinner(`<@${A}> طلّع <@${B}>`), null);
        assert.equal(parseWinner('👑 | Zatona'), null);
    });

    test('pays the winner once, only for the games bot', async () => {
        const client = { db: memoryDb() };
        const win = winMessage(`👑 | <@${A}>`);
        assert.equal(await handleGamesBotWin(win, client), true);
        assert.equal(await handleGamesBotWin(win, client), true);
        const profile = await getProfile(client, GUILD, A);
        assert.equal(profile.cc, CC.gamesBot.win);
        assert.equal(profile.stats.groupWins, 1);
        assert.equal(win.replies.length, 1);

        assert.equal(await handleGamesBotWin(winMessage(`👑 | <@${A}>`, { authorId: B, bot: false }), client), false);
        assert.equal(await handleGamesBotWin(winMessage(`👑 | <@${A}>`, { authorId: '300000000000000001' }), client), false);
        assert.equal(await handleGamesBotWin(winMessage(`👑 | <@${B}>`, { winnerBot: true }), client), true);
        assert.equal((await getProfile(client, GUILD, A)).cc, CC.gamesBot.win);
        assert.equal((await getProfile(client, GUILD, B)).cc, 0);
    });

    test('during a CC event a win pays ×5 and the notice says so and when it ends', async () => {
        const client = { db: memoryDb() };
        const saved = CC.boost;
        CC.boost = { multiplier: 5, until: '2999-01-01T00:00:00Z' };
        try {
            const win = winMessage(`👑 | <@${A}>`);
            await handleGamesBotWin(win, client);
            assert.equal((await getProfile(client, GUILD, A)).cc, CC.gamesBot.win * 5);
            assert.match(win.replies[0].content, new RegExp(`\\+\\*\\*${CC.gamesBot.win * 5}\\*\\*`, 'u'));
            assert.match(win.replies[0].content, /🔥 \*\*CC ×5\*\*.*<t:\d+:R>/u);
        } finally {
            CC.boost = saved;
        }
    });

    test('GAMES_BOT_IDS switches to a premium copy of the bot', async () => {
        const client = { db: memoryDb() };
        process.env.GAMES_BOT_IDS = '300000000000000001';
        try {
            assert.equal(await handleGamesBotWin(winMessage(`👑 | <@${A}>`, { authorId: '300000000000000001' }), client), true);
            assert.equal(await handleGamesBotWin(winMessage(`👑 | <@${A}>`), client), false);
        } finally {
            delete process.env.GAMES_BOT_IDS;
        }
        assert.equal((await getProfile(client, GUILD, A)).cc, CC.gamesBot.win);
    });

    test('a first-to-answer win pays the solo amount, a crown win the group amount, both ×5 in the event', async () => {
        const { parseWin } = await import('../src/services/cc/gamesBotWins.js');
        const answer = `✅ | قام <@${A}> بكتابة الاجابة الصحيحة خلال **__4.12__** ثانية`;
        assert.deepEqual(parseWin(answer), { userId: A, kind: 'answer' });
        assert.deepEqual(parseWin(`✅ | قام <@!${A}> بكتابة الإجابة الصحيحة خلال 2 ثانية`), { userId: A, kind: 'answer' });
        assert.deepEqual(parseWin(`👑 | <@${A}>`), { userId: A, kind: 'group' });
        // The leading emoji can be a custom one or missing; the sentence itself has to start the text.
        assert.deepEqual(parseWin(`قام <@${A}> بكتابة الاجابة الصحيحة`), { userId: A, kind: 'answer' });
        assert.equal(parseWin(`مبروك قام <@${A}> بكتابة الاجابة الصحيحة`), null);
        assert.equal(parseWin(`✅ | قام <@${A}> بكتابة اجابة غلط`), null);
        assert.equal(CC.gamesBot.win, 50);
        assert.equal(CC.gamesBot.answer, 10);

        const saved = CC.boost;
        CC.boost = { multiplier: 1, until: '2000-01-01T00:00:00Z' };
        try {
            const client = { db: memoryDb() };
            const message = winMessage(answer);
            assert.equal(await handleGamesBotWin(message, client), true);
            let profile = await getProfile(client, GUILD, A);
            assert.equal(profile.cc, 10);
            assert.equal(profile.stats.soloWins, 1);
            assert.equal(profile.stats.groupWins, 0);
            assert.match(message.replies[0].content, /\+\*\*10\*\*/u);
            await handleGamesBotWin(winMessage(`👑 | <@${A}>`), client);
            profile = await getProfile(client, GUILD, A);
            assert.equal(profile.cc, 60);
            assert.equal(profile.stats.groupWins, 1);

            CC.boost = { multiplier: 5, until: '2999-01-01T00:00:00Z' };
            const boosted = { db: memoryDb() };
            await handleGamesBotWin(winMessage(answer), boosted);
            assert.equal((await getProfile(boosted, GUILD, A)).cc, 50);
            await handleGamesBotWin(winMessage(`👑 | <@${A}>`), boosted);
            assert.equal((await getProfile(boosted, GUILD, A)).cc, 50 + 250);
        } finally {
            CC.boost = saved;
        }
    });

    test('our server pays 500 for a group win and 50 for an answer; another server keeps 50 and 10', async () => {
        const { HOME_GUILD_ID } = await import('../src/config/homeGuild.js');
        const { gamesBotReward } = await import('../src/config/cc.js');
        assert.equal(gamesBotReward('group', HOME_GUILD_ID), 500);
        assert.equal(gamesBotReward('answer', HOME_GUILD_ID), 50);
        assert.equal(gamesBotReward('group', GUILD), 50);
        assert.equal(gamesBotReward('answer', GUILD), 10);

        const client = { db: memoryDb() };
        const home = (content) => ({ ...winMessage(content), guild: { id: HOME_GUILD_ID } });
        await handleGamesBotWin(home(`👑 | <@${A}>`), client);
        assert.equal((await getProfile(client, HOME_GUILD_ID, A)).cc, 500);
        const answer = home(`✅ | قام <@${A}> بكتابة الاجابة الصحيحة خلال 2 ثانية`);
        await handleGamesBotWin(answer, client);
        assert.equal((await getProfile(client, HOME_GUILD_ID, A)).cc, 550);
        assert.match(answer.replies[0].content, /\+\*\*50\*\*/u);
    });

    test('reads a win shown in an embed or a components v2 box, like Clover does', async () => {
        const { parseWinMessage } = await import('../src/services/cc/gamesBotWins.js');
        const text = `✅ | قام <@${A}> بكتابة الاجابة الصحيحة خلال **5.61** ثانية`;
        assert.deepEqual(parseWinMessage({ content: '', embeds: [{ data: { description: text } }] }), { userId: A, kind: 'answer' });
        const container = { type: 17, accent_color: 0x57f287, components: [{ type: 10, content: text }] };
        assert.deepEqual(parseWinMessage({ content: '', components: [{ toJSON: () => container }] }), { userId: A, kind: 'answer' });
        const section = { type: 9, components: [{ type: 10, content: `👑 | <@${B}>` }], accessory: { type: 11 } };
        assert.deepEqual(parseWinMessage({ content: '', components: [{ type: 17, components: [section] }] }), { userId: B, kind: 'group' });
        assert.deepEqual(parseWinMessage({ content: `<:check:123456789012345678> | قام <@${A}> بكتابة الاجابة الصحيحة` }), { userId: A, kind: 'answer' });
        assert.equal(parseWinMessage({ content: '', embeds: [{ data: { description: 'اللعبة بدأت!' } }] }), null);

        const client = { db: memoryDb() };
        const embedWin = { ...winMessage(''), embeds: [{ data: { description: text } }] };
        assert.equal(await handleGamesBotWin(embedWin, client), true);
        assert.equal((await getProfile(client, GUILD, A)).cc, CC.gamesBot.answer);
        assert.equal(embedWin.replies.length, 1);
    });

    test('a Clover message edited into a win pays once', async () => {
        const { default: messageUpdate } = await import('../src/events/messageUpdate.js');
        const client = { db: memoryDb() };
        const text = `✅ | قام <@${C}> بكتابة الاجابة الصحيحة خلال **2.1** ثانية`;
        const edited = { ...winMessage(''), embeds: [{ data: { description: text } }], client, partial: false };
        edited.author.bot = true;
        await messageUpdate.execute({ content: '' }, edited);
        await messageUpdate.execute({ content: '' }, edited);
        assert.equal((await getProfile(client, GUILD, C)).cc, CC.gamesBot.answer);
    });

    test('no daily cap outside the CC event', async () => {
        const client = { db: memoryDb() };
        for (let i = 0; i < 150; i += 1) await handleGamesBotWin(winMessage(`👑 | <@${C}>`), client);
        const profile = await getProfile(client, GUILD, C);
        assert.equal(profile.cc, 150 * CC.gamesBot.win);
        assert.equal(profile.stats.groupWins, 150);
    });

    test('during the CC event the daily cap is a flat 5000, not multiplied', async () => {
        const saved = CC.boost;
        CC.boost = { multiplier: 5, until: '2999-01-01T00:00:00Z' };
        try {
            const client = { db: memoryDb() };
            const wins = Math.ceil(5000 / (CC.gamesBot.win * 5)) + 2;
            let last;
            for (let i = 0; i < wins; i += 1) {
                last = winMessage(`👑 | <@${C}>`);
                await handleGamesBotWin(last, client);
            }
            const profile = await getProfile(client, GUILD, C);
            assert.equal(profile.cc, 5000);
            assert.equal(profile.stats.groupWins, wins);
            assert.match(last.replies[0].content, /\(5000 CC\)/u);
        } finally {
            CC.boost = saved;
        }
    });
});
