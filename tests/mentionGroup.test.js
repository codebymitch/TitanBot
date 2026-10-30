import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { HOME_GUILD_ID } from '../src/config/homeGuild.js';
import { handleMentionGroupCommand, mentionGroupAction, getMentionGroup } from '../src/services/mentionGroup.js';

const OWNER = '1159601661392715906';
const TRUSTED = '200000000000000002';
const STRANGER = '200000000000000003';
const A = '200000000000000011';
const B = '200000000000000012';

function setup(guildId = HOME_GUILD_ID) {
  const store = new Map();
  const sent = [];
  const client = {
    user: { id: 'bot' },
    db: {
      get: async (key, fallback) => (key.includes(':config') ? { antiNukeTrustedUsers: [TRUSTED] } : (store.has(key) ? structuredClone(store.get(key)) : fallback)),
      set: async (key, value) => { store.set(key, structuredClone(value)); return true; },
    },
  };
  const guild = { id: guildId, ownerId: '1', client };
  const run = (authorId, content) => {
    const [commandName, ...args] = content.split(/\s+/u);
    const message = { guild, author: { id: authorId }, content, channel: { send: async (payload) => { sent.push(payload); } } };
    return handleMentionGroupCommand(message, commandName, args);
  };
  return { guild, sent, run, client };
}

describe('mention group (report #226)', () => {
  test('words map to actions; a normal sentence is not a command', () => {
    assert.equal(mentionGroupAction('منشن', []).action, 'ping');
    assert.equal(mentionGroupAction('اضافه', ['منشن', A]).action, 'add');
    assert.equal(mentionGroupAction('شيل', ['منشن', A]).action, 'remove');
    assert.equal(mentionGroupAction('قائمة', ['منشن']).action, 'list');
    assert.equal(mentionGroupAction('شيل', ['رول', A]), null);
  });

  test('add people, ping them together with a message, remove one', async () => {
    const { sent, run, client, guild } = setup();
    assert.equal(await run(TRUSTED, `اضافه منشن <@${A}> ${B}`), true);
    assert.deepEqual(await getMentionGroup(client, guild.id), [A, B]);

    assert.equal(await run(OWNER, 'منشن تعالوا الفويس'), true);
    const ping = sent.at(-1);
    assert.equal(ping.content, `<@${A}> <@${B}>\nتعالوا الفويس`);
    assert.deepEqual(ping.allowedMentions.users, [A, B]);

    await run(OWNER, `شيل منشن <@${A}>`);
    assert.deepEqual(await getMentionGroup(client, guild.id), [B]);
    await run(OWNER, 'قائمة منشن');
    assert.match(sent.at(-1).content, new RegExp(B));
  });

  test('anyone else just chats; another server gets nothing', async () => {
    const home = setup();
    assert.equal(await home.run(STRANGER, `اضافه منشن ${A}`), false);
    assert.equal(await home.run(STRANGER, 'منشن الادارة'), false);
    assert.equal(home.sent.length, 0);

    const other = setup('300000000000000001');
    assert.equal(await other.run(OWNER, `اضافه منشن ${A}`), false);
    assert.equal(other.sent.length, 0);
  });
});
