import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ChannelType, PermissionFlagsBits } from 'discord.js';
import dm, { buildStaffDm, getServerInviteUrl } from '../src/commands/Moderation/dm.js';

function fakeGuild({ vanity = null, canInvite = true, createInvite } = {}) {
    const channel = {
        type: ChannelType.GuildText,
        rawPosition: 0,
        permissionsFor: () => ({ has: (perm) => canInvite && perm === PermissionFlagsBits.CreateInstantInvite }),
    };
    const cache = new Map([['1', channel]]);
    cache.filter = (fn) => {
        const out = [...cache.values()].filter(fn);
        return { sort: (cmp) => ({ first: () => out.sort(cmp)[0] }) };
    };
    return {
        id: '1', name: 'My Server', vanityURLCode: vanity,
        iconURL: () => null,
        members: { me: {} },
        rulesChannel: null, systemChannel: null,
        channels: { cache },
        invites: { create: createInvite || (async () => ({ url: 'https://discord.gg/abc123' })) },
    };
}

describe('/dm', () => {
    test('no longer has an option to reveal the sender', () => {
        assert.deepEqual(dm.data.options.map((o) => o.name), ['user', 'message']);
    });

    test('the DM names the staff, not the sender, and links the server', () => {
        const payload = buildStaffDm(fakeGuild(), 'اهلا', 'https://discord.gg/abc123');
        const embed = payload.embeds[0].toJSON();
        assert.equal(embed.title, 'رسالة من الإدارة');
        assert.equal(embed.description, 'اهلا');
        assert.equal(embed.author.name, 'My Server');
        const button = payload.components[0].toJSON().components[0];
        assert.equal(button.url, 'https://discord.gg/abc123');
        assert.equal(button.label, 'رابط السيرفر');
    });

    test('no button when there is no link', () => {
        assert.deepEqual(buildStaffDm(fakeGuild(), 'x', null).components, []);
    });

    test('server link: vanity first, then a permanent reusable invite, else null', async () => {
        assert.equal(await getServerInviteUrl(fakeGuild({ vanity: 'myserver' })), 'https://discord.gg/myserver');

        let options;
        const url = await getServerInviteUrl(fakeGuild({ createInvite: async (_c, o) => { options = o; return { url: 'https://discord.gg/abc123' }; } }));
        assert.equal(url, 'https://discord.gg/abc123');
        assert.equal(options.maxAge, 0);
        assert.equal(options.unique, false);

        assert.equal(await getServerInviteUrl(fakeGuild({ canInvite: false })), null);
        assert.equal(await getServerInviteUrl(fakeGuild({ createInvite: async () => { throw new Error('nope'); } })), null);
    });
});
