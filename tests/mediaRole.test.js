import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { PermissionsBitField, PermissionFlagsBits } from 'discord.js';
import { hasMediaContent, isPlayCommand, findMediaRole, isMediaRole, grantMediaRoleToAllMembers } from '../src/services/mediaRoleService.js';

const message = (content, attachments = 0) => ({ content, attachments: { size: attachments } });

describe('media lock', () => {
  test('attachments, links and GIFs count as media', () => {
    assert.equal(hasMediaContent(message('', 1)), true);
    assert.equal(hasMediaContent(message('شوف https://example.com')), true);
    assert.equal(hasMediaContent(message('www.example.com')), true);
    assert.equal(hasMediaContent(message('discord.gg/abc')), true);
  });

  test('a play command with a link is a music request, not media', () => {
    assert.equal(isPlayCommand(message('شغل https://www.youtube.com/playlist?list=PL1')), true);
    assert.equal(isPlayCommand(message('=play https://open.spotify.com/playlist/abc')), true);
    assert.equal(isPlayCommand(message('شوف https://example.com شغل')), false);
    assert.equal(isPlayCommand(message('شغل https://example.com', 1)), false);
  });

  test('GIFs count as media too', () => {
    assert.equal(hasMediaContent(message('https://tenor.com/view/cat-gif-123')), true);
    assert.equal(hasMediaContent(message('https://giphy.com/gifs/funny-abc')), true);
    assert.equal(hasMediaContent(message('https://media.discordapp.net/attachments/1/2/a.gif?ex=1')), true);
    assert.equal(hasMediaContent(message('', 1)), true);
  });

  test('plain text is not media', () => {
    assert.equal(hasMediaContent(message('ازيك يا جماعة')), false);
    assert.equal(hasMediaContent(message('3.5 ساعة')), false);
  });

  test('the media role is only found, never created or edited, and @everyone is never changed', async () => {
    const role = (id, name) => ({
      id, name, managed: false, editable: true,
      permissions: new PermissionsBitField([PermissionFlagsBits.AttachFiles]),
      async setPermissions() { throw new Error('must not change permissions'); },
      async setPosition() { throw new Error('must not move'); },
      async edit() { throw new Error('must not edit'); },
    });
    const everyone = role('everyone', '@everyone');
    const roles = new Map([[everyone.id, everyone]]);
    roles.find = (fn) => [...roles.values()].find(fn);
    const guild = {
      id: 'g-media', name: 'test',
      roles: { everyone, fetch: async () => roles, create: async () => { throw new Error('must not create'); } },
    };

    assert.equal(await findMediaRole(guild), null);
    const media = role('media-id', 'media');
    roles.set(media.id, media);
    assert.equal(await findMediaRole(guild), media);
    // Renamed by the owner: still the media role.
    media.name = 'صور';
    assert.equal(await findMediaRole(guild), media);
    assert.equal(isMediaRole(media, guild.id), true);
  });

  test('gives the media role to every current member once, skipping bots', async () => {
    const store = new Map();
    const media = { id: 'media-role', name: 'media', managed: false, editable: true };
    const member = (id, { bot = false, hasMedia = false } = {}) => {
      const ids = new Set(hasMedia ? [media.id] : []);
      return { user: { tag: id, bot }, roles: { cache: { has: (roleId) => ids.has(roleId) }, add: async (role) => { ids.add(role.id); } }, ids };
    };
    const members = new Map([['a', member('a')], ['b', member('b', { hasMedia: true })], ['bot', member('bot', { bot: true })]]);
    const guild = {
      id: 'g1',
      name: 'test',
      client: { db: { get: async (key, fallback) => (store.has(key) ? store.get(key) : fallback), set: async (key, value) => { store.set(key, value); return true; } } },
      roles: { cache: { find: (fn) => [media].find(fn) } },
      members: { fetch: async () => members },
    };

    assert.deepEqual(await grantMediaRoleToAllMembers(guild), { skipped: false, granted: 1, failed: 0 });
    assert.equal(members.get('a').ids.has(media.id), true);
    assert.equal(members.get('bot').ids.has(media.id), false);

    members.set('late', member('late'));
    assert.deepEqual(await grantMediaRoleToAllMembers(guild), { skipped: true, granted: 0, failed: 0 });
    assert.equal(members.get('late').ids.has(media.id), false);
  });
});
