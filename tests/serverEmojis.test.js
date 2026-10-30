import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { PermissionsBitField } from 'discord.js';
import { ensureServerEmojis, listServerEmojiFiles } from '../src/services/serverEmojiService.js';

const guildWith = ({ permissions = PermissionsBitField.All, existing = [], failOn = [] } = {}) => {
  const created = [];
  return {
    created,
    members: { me: { permissions: new PermissionsBitField(permissions) } },
    emojis: {
      fetch: async () => existing.map((name) => ({ name })),
      create: async ({ name, attachment }) => {
        if (failOn.includes(name)) throw new Error('Maximum number of emojis reached');
        created.push({ name, attachment });
      },
    },
  };
};

describe('server emojis', () => {
  test('every emoji file has a valid Discord emoji name', async () => {
    const files = await listServerEmojiFiles();
    for (const { name } of files) assert.match(name, /^[\w]{2,32}$/u);
  });

  test('uploads nothing when the emoji folder is empty', async () => {
    const files = await listServerEmojiFiles();
    const guild = guildWith();
    const result = await ensureServerEmojis(guild);
    assert.deepEqual(result, { skipped: false, added: files.length, failed: 0 });
  });

  test('skips when the bot cannot manage expressions', async () => {
    const result = await ensureServerEmojis(guildWith({ permissions: 0n }));
    assert.deepEqual(result, { skipped: true, added: 0, failed: 0 });
  });
});

describe('peepo emoji pack (home server only)', () => {
  test('uploads the missing peepo emojis in the home server', async () => {
    const { HOME_GUILD_ID } = await import('../src/config/homeGuild.js');
    const { ensurePeepoEmojis } = await import('../src/services/serverEmojiService.js');
    const { PEEPO_EMOJIS } = await import('../src/config/peepoEmojis.js');
    const guild = { ...guildWith({ existing: ['Peepo_Wave'] }), id: HOME_GUILD_ID };
    const result = await ensurePeepoEmojis(guild);
    assert.deepEqual(result, { skipped: false, added: PEEPO_EMOJIS.length - 1, failed: 0 });
    assert.ok(PEEPO_EMOJIS.every(({ name }) => /^\w{2,32}$/u.test(name)));
  });

  test('leaves other servers alone', async () => {
    const { ensurePeepoEmojis } = await import('../src/services/serverEmojiService.js');
    const guild = { ...guildWith(), id: '1' };
    assert.deepEqual(await ensurePeepoEmojis(guild), { skipped: true, added: 0, failed: 0 });
    assert.equal(guild.created.length, 0);
  });
});

describe('animated face emojis (home server only)', () => {
  test('uploads the missing animated GIFs in the home server', async () => {
    const { HOME_GUILD_ID } = await import('../src/config/homeGuild.js');
    const { ensureAnimatedEmojis, listAnimatedEmojiFiles } = await import('../src/services/serverEmojiService.js');
    const files = await listAnimatedEmojiFiles();
    assert.equal(files.length, 24);
    for (const { name } of files) assert.match(name, /^\w{2,32}$/u);
    const guild = { ...guildWith({ existing: ['face_laugh'] }), id: HOME_GUILD_ID };
    assert.deepEqual(await ensureAnimatedEmojis(guild), { skipped: false, added: 23, failed: 0 });
    assert.ok(guild.created.every((emoji) => emoji.attachment.endsWith(`${emoji.name}.gif`)));
  });

  test('leaves other servers alone', async () => {
    const { ensureAnimatedEmojis } = await import('../src/services/serverEmojiService.js');
    const guild = { ...guildWith(), id: '1' };
    assert.deepEqual(await ensureAnimatedEmojis(guild), { skipped: true, added: 0, failed: 0 });
    assert.equal(guild.created.length, 0);
  });
});
