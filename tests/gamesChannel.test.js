import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
    GAMES_CHANNEL_ID, typedCommandName, isGameCommandMessage, isBlockedSlashCommand, handleGamesChannelMessage,
} from '../src/services/games/gamesChannel.js';
import { buildGamesPanel, PANEL_ACTIONS, isGroupGame } from '../src/services/games/panel.js';
import { claimChannel, releaseChannel, gameAcceptsChat, sendGameMessage, deleteGameMessages, canControlGame } from '../src/services/games/session.js';
import { SOLO_GAMES } from '../src/services/games/solo.js';
import { applyWordAliases } from '../src/config/commands/commandAliases.js';
import { SERVER_OWNER_IDS } from '../src/config/serverOwners.js';
import gamesPanelButton from '../src/interactions/buttons/games/gamesPanel.js';

const MEMBER = '200000000000000009';

function fakeMessage(content, { authorId = MEMBER, bot = false, channelId = GAMES_CHANNEL_ID } = {}) {
    const sent = [];
    const message = {
        content,
        channelId,
        guild: { id: '100000000000000001' },
        author: { id: authorId, bot },
        client: { user: { id: '999999999999999999' } },
        deleted: false,
        delete: async () => { message.deleted = true; },
        channel: { send: async (payload) => { sent.push(payload); return { delete: async () => {} }; } },
        sent,
    };
    return message;
}
const client = { db: { get: async (key, fallback) => fallback } };

describe('games channel', () => {
    // These tests cover the games themselves, which are off by default now (config/games.js).
    const previous = process.env.GAMES_ENABLED;
    before(() => { process.env.GAMES_ENABLED = 'true'; });
    after(() => { if (previous === undefined) delete process.env.GAMES_ENABLED; else process.env.GAMES_ENABLED = previous; });

    test('recognises game commands with and without the prefix', () => {
        assert.equal(typedCommandName('روليت', '!'), 'game');
        assert.equal(typedCommandName('!روليت', '!'), 'game');
        assert.equal(typedCommandName('اسئلة 5', '!'), 'game');
        assert.equal(typedCommandName('top cc', '!'), 'cctop');
        assert.equal(typedCommandName('TOP CC', '!'), 'cctop');
        assert.equal(typedCommandName('رصيد', '!'), 'cc');
        assert.equal(typedCommandName('سؤال يا جماعة', '!'), null);
        assert.ok(isGameCommandMessage('حجر', ['!']));
        assert.ok(isGameCommandMessage('اكس <@200000000000000001>', ['!']));
        assert.ok(!isGameCommandMessage('بان <@200000000000000001>', ['!']));
        assert.ok(!isGameCommandMessage('هاي يا شباب', ['!']));
        assert.ok(!isGameCommandMessage('top', ['!']));
    });

    test('deletes chat but keeps game commands, owners and in-game answers', async () => {
        const chat = fakeMessage('هاي يا شباب');
        assert.equal(await handleGamesChannelMessage(chat, client), true);
        assert.ok(chat.deleted);
        assert.equal(chat.sent.length, 1);

        const again = fakeMessage('تاني');
        await handleGamesChannelMessage(again, client);
        assert.ok(again.deleted);
        assert.equal(again.sent.length, 0, 'the notice is rate limited');

        const command = fakeMessage('العاب');
        assert.equal(await handleGamesChannelMessage(command, client), false);
        assert.ok(!command.deleted);

        const owner = fakeMessage('اي حاجة', { authorId: SERVER_OWNER_IDS[0] });
        assert.equal(await handleGamesChannelMessage(owner, client), false);

        const otherBot = fakeMessage('spam', { authorId: '300000000000000001', bot: true });
        assert.equal(await handleGamesChannelMessage(otherBot, client), true);

        const elsewhere = fakeMessage('هاي', { channelId: '123456789012345678' });
        assert.equal(await handleGamesChannelMessage(elsewhere, client), false);

        const session = claimChannel(GAMES_CHANNEL_ID, 'trivia', MEMBER);
        assert.equal(await handleGamesChannelMessage(fakeMessage('القاهرة', { authorId: '200000000000000010' }), client), true, 'no chat before the game opens it');
        session.chatOpen = true;
        assert.equal(await handleGamesChannelMessage(fakeMessage('القاهرة', { authorId: '200000000000000010' }), client), false);
        releaseChannel(session);
    });

    test('lobby games only let their players talk', () => {
        const session = claimChannel('chan-mafia', 'mafia', MEMBER);
        assert.equal(gameAcceptsChat('chan-mafia', MEMBER), false);
        session.players = new Set([MEMBER]);
        assert.equal(gameAcceptsChat('chan-mafia', MEMBER), true);
        assert.equal(gameAcceptsChat('chan-mafia', '200000000000000010'), false);
        releaseChannel(session);
        assert.equal(gameAcceptsChat('chan-mafia', MEMBER), false);
    });

    test('other slash commands are refused there, except for owners', () => {
        assert.ok(isBlockedSlashCommand(GAMES_CHANNEL_ID, 'ban', MEMBER));
        assert.ok(!isBlockedSlashCommand(GAMES_CHANNEL_ID, 'game', MEMBER));
        assert.ok(!isBlockedSlashCommand(GAMES_CHANNEL_ID, 'ban', SERVER_OWNER_IDS[0]));
        assert.ok(!isBlockedSlashCommand('123456789012345678', 'ban', MEMBER));
    });

    test('CC words and the natural ways of typing stop', () => {
        assert.equal(isGameCommandMessage('يومي', ['!']), false);
        assert.equal(typedCommandName('رصيدى', '!'), 'cc');
        assert.equal(typedCommandName('Top CC', '!'), 'cctop');
        assert.equal(typedCommandName('وقف', '!'), 'game');
        assert.equal(typedCommandName('ايقاف', '!'), 'game');
        assert.deepEqual(applyWordAliases('وقف', ['اللعبة'], false), { commandName: 'game', args: ['stop'] });
        assert.deepEqual(applyWordAliases('إيقاف', ['اللعبه'], false), { commandName: 'game', args: ['stop'] });
        assert.deepEqual(applyWordAliases('top', ['cc'], false), { commandName: 'cctop', args: [] });
        assert.deepEqual(applyWordAliases('ماس', ['بان', '1'], true), { commandName: 'massban', args: ['1'] });
    });

    test('CC commands live in the Games category, so turning off Economy never hides them', async () => {
        const { loadCommands } = await import('../src/handlers/loaders/commandLoader.js');
        const loaded = {};
        await loadCommands(loaded);
        for (const name of ['cc', 'cctop', 'game', 'solo']) assert.equal(loaded.commands.get(name).category, 'Games', name);
    });

    test('word aliases', () => {
        assert.deepEqual(applyWordAliases('خمن', ['3'], false), { commandName: 'game', args: ['guess', '3'] });
        assert.equal(applyWordAliases('خمن', ['ايه', 'ده'], false), null);
        assert.deepEqual(applyWordAliases('خمن', ['ايه'], true), { commandName: 'game', args: ['guess', 'ايه'] });
        assert.deepEqual(applyWordAliases('ban', ['x'], false), { commandName: 'ban', args: ['x'] });
    });
});

describe('who controls a game', () => {
    test('only the host and trusted members', async () => {
        const GUILD = '100000000000000001';
        const TRUSTED_USER = '200000000000000011';
        const TRUSTED_ROLE = '300000000000000011';
        const ROLE_HOLDER = '200000000000000012';
        const STAFF = '200000000000000013';
        const store = new Map([[`guild:${GUILD}:config`, { antiNukeTrustedUsers: [TRUSTED_USER], antiNukeTrustedRoles: [TRUSTED_ROLE] }]]);
        const client = { user: { id: '999999999999999999' }, db: { get: async (key, fallback) => (store.has(key) ? store.get(key) : fallback), set: async () => true } };
        const roles = { [ROLE_HOLDER]: [TRUSTED_ROLE], [STAFF]: ['300000000000000099'] };
        const guild = {
            id: GUILD,
            ownerId: '200000000000000099',
            client,
            members: { fetch: async (id) => ({ roles: { cache: { some: (fn) => (roles[id] || []).map((roleId) => ({ id: roleId })).some(fn) } } }) },
        };
        const session = { hostId: MEMBER };
        assert.equal(await canControlGame(guild, MEMBER, session), true, 'host');
        assert.equal(await canControlGame(guild, TRUSTED_USER, session), true, 'trusted user');
        assert.equal(await canControlGame(guild, ROLE_HOLDER, session), true, 'trusted role');
        assert.equal(await canControlGame(guild, SERVER_OWNER_IDS[0], session), true, 'server owner');
        assert.equal(await canControlGame(guild, guild.ownerId, session), true, 'guild owner');
        assert.equal(await canControlGame(guild, STAFF, session), false, 'other staff');
    });
});

describe('cancelled games', () => {
    test('delete every message they posted', async () => {
        const deleted = [];
        let nextId = 1;
        const makeMessage = () => { const id = String(nextId++); return { id, delete: async () => { deleted.push(id); } }; };
        const channel = { send: async () => makeMessage() };
        const session = claimChannel('chan-cleanup', 'roulette', MEMBER);
        await sendGameMessage(session, channel, 'lobby');
        await sendGameMessage(session, channel, 'round 1');
        session.track(makeMessage());
        await deleteGameMessages(session, channel);
        assert.deepEqual(deleted.sort(), ['1', '2', '3']);

        deleted.length = 0;
        await sendGameMessage(session, channel, 'a');
        await sendGameMessage(session, channel, 'b');
        const bulk = { ...channel, bulkDelete: async (ids) => new Map(ids.map((id) => [id, {}])) };
        await deleteGameMessages(session, bulk);
        assert.deepEqual(deleted, [], 'bulk delete used when allowed');
        releaseChannel(session);
    });
});

describe('games panel', () => {
    test('fits Discord limits and every button has a handler', () => {
        const panel = buildGamesPanel();
        assert.ok(panel.components.length <= 5);
        for (const row of panel.components) assert.ok(row.components.length <= 5);
        const ids = panel.components.flatMap((row) => row.components.map((button) => button.data.custom_id));
        assert.equal(new Set(ids).size, ids.length);
        for (const id of ids) {
            assert.ok(id.startsWith(`${gamesPanelButton.name}:`));
            assert.ok(id.length <= 100);
        }
        const handled = (action) => isGroupGame(action) || SOLO_GAMES[action.replace('solo_', '')] || ['rps', 'stop', 'daily', 'balance', 'top'].includes(action);
        for (const action of PANEL_ACTIONS) assert.ok(handled(action), action);

        const [embed] = panel.embeds;
        assert.ok(embed.title.includes('🎮'), 'keeps emojis');
        assert.ok(embed.fields.every((field) => field.value.length <= 1024 && field.name.length <= 256));
        const size = embed.title.length + embed.description.length + embed.footer.text.length
            + embed.fields.reduce((sum, field) => sum + field.name.length + field.value.length, 0);
        assert.ok(size <= 6000);
    });
});
