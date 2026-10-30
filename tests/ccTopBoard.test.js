import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { GAMES_CHANNEL_ID } from '../src/services/games/gamesChannel.js';
import { buildCCTopBoard, isCCTopBoard, publishCCTopBoard, CC_TOP_BOARD_FOOTER } from '../src/services/games/ccTopBoard.js';
import { ccTopEmbed } from '../src/commands/Games/cctop.js';
import { getEconomyKey } from '../src/utils/database.js';

const GUILD_ID = '100000000000000001';
const BOT_ID = '999999999999999999';

function fakeClient(balances = {}) {
    const store = new Map(Object.entries(balances).map(([userId, cc]) => [getEconomyKey(GUILD_ID, userId), { cc }]));
    const db = {
        get: async (key, fallback) => (store.has(key) ? store.get(key) : fallback),
        set: async (key, value) => { store.set(key, value); return true; },
        list: async (prefix) => [...store.keys()].filter((key) => key.startsWith(prefix)),
    };
    return { db, user: { id: BOT_ID } };
}

function fakeChannel(client, messages = []) {
    const channel = {
        id: GAMES_CHANNEL_ID,
        client,
        guild: { id: GUILD_ID, name: 'Chaos' },
        sent: [],
        isTextBased: () => true,
        messages: {
            fetch: async (arg) => {
                if (typeof arg === 'string') {
                    const found = messages.find((message) => message.id === arg);
                    if (!found) throw new Error('Unknown Message');
                    return found;
                }
                return new Map(messages.map((message) => [message.id, message]));
            },
        },
        send: async (payload) => {
            const message = { id: `sent-${channel.sent.length}`, author: { id: BOT_ID }, createdTimestamp: Date.now(), ...payload };
            channel.sent.push(payload);
            return message;
        },
    };
    client.channels = { fetch: async (id) => (id === GAMES_CHANNEL_ID ? channel : null) };
    return channel;
}

describe('Top CC board', () => {
    test('lists the richest members without a personal rank line', async () => {
        const client = fakeClient({ 1: 50, 2: 300, 3: 120 });
        const embed = await buildCCTopBoard(client, { id: GUILD_ID, name: 'Chaos' });
        assert.equal(embed.footer.text, CC_TOP_BOARD_FOOTER);
        assert.ok(embed.timestamp);
        assert.ok(embed.description.indexOf('<@2>') < embed.description.indexOf('<@3>'));
        assert.ok(embed.description.indexOf('<@3>') < embed.description.indexOf('<@1>'));
        assert.ok(!embed.description.includes('ترتيبك'));

        const personal = await ccTopEmbed(client, { id: GUILD_ID, name: 'Chaos' }, '3');
        assert.ok(personal.description.includes('ترتيبك: **#2**'));
    });

    test('only the footer marks the board, so top cc replies are left alone', () => {
        assert.equal(isCCTopBoard({ embeds: [{ footer: { text: CC_TOP_BOARD_FOOTER } }] }), true);
        assert.equal(isCCTopBoard({ embeds: [{ title: '🌀 Top CC — Chaos' }] }), false);
        assert.equal(isCCTopBoard({ embeds: [] }), false);
    });

    test('posts the board once, then edits the same post', async () => {
        const client = fakeClient({ 1: 10 });
        const messages = [];
        const channel = fakeChannel(client, messages);

        assert.equal((await publishCCTopBoard(client)).status, 'sent');
        assert.equal(channel.sent.length, 1);

        const edits = [];
        const reply = { id: 'reply', author: { id: BOT_ID }, createdTimestamp: 1, embeds: [{ title: '🌀 Top CC — Chaos' }], delete: async () => assert.fail('a top cc reply was deleted') };
        const board = {
            id: 'board', author: { id: BOT_ID }, createdTimestamp: 2,
            embeds: [{ footer: { text: CC_TOP_BOARD_FOOTER } }],
            edit: async (payload) => { edits.push(payload); },
        };
        messages.push(reply, board);

        assert.equal((await publishCCTopBoard(client)).status, 'updated');
        assert.equal(channel.sent.length, 1);
        assert.equal(edits.length, 1);
        assert.equal(edits[0].embeds[0].footer.text, CC_TOP_BOARD_FOOTER);
    });

    test('does nothing when the bot cannot see the games channel', async () => {
        const client = fakeClient();
        client.channels = { fetch: async () => { throw new Error('Missing Access'); } };
        assert.equal((await publishCCTopBoard(client)).status, 'no-channel');
    });
});
