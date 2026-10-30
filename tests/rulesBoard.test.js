import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { PermissionsBitField } from 'discord.js';
import { buildRulesEmbed, publishRulesBoard, RULES_CHANNEL_ID, RULES_TITLE } from '../src/services/rulesBoardService.js';

function setup({ permissions = PermissionsBitField.All } = {}) {
  const bot = { id: 'bot' };
  const messages = new Map();
  const sends = [];
  let seq = 0;
  const post = (embed) => {
    const id = String(++seq);
    const message = {
      id, author: bot, createdTimestamp: seq, embeds: [embed],
      edit: async (payload) => { sends.push({ edit: true, ...payload }); message.embeds = [payload.embeds[0]]; },
      delete: async () => messages.delete(id),
    };
    messages.set(id, message);
    return message;
  };
  const channel = {
    id: RULES_CHANNEL_ID, guild: { id: 'g', name: 'Test', members: { me: {} } }, isTextBased: () => true,
    permissionsFor: () => new PermissionsBitField(permissions),
    messages: { fetch: async (arg) => (typeof arg === 'string' ? messages.get(arg) || null : new Map(messages)) },
    send: async (payload) => { sends.push(payload); return post(payload.embeds[0]); },
  };
  const client = { user: bot, channels: { fetch: async (id) => (id === RULES_CHANNEL_ID ? channel : null) } };
  channel.client = client;
  return { client, messages, sends, post };
}

describe('rules board', () => {
  test('fits Discord embed limits and keeps its emojis', () => {
    const embed = buildRulesEmbed({ name: 'Test' });
    assert.equal(embed.title, RULES_TITLE);
    assert.ok(embed.fields.length <= 25);
    for (const field of embed.fields) assert.ok(field.value.length <= 1024, field.name);
    const total = [embed.title, embed.description, embed.footer.text, ...embed.fields.flatMap((f) => [f.name, f.value])].join('').length;
    assert.ok(total <= 6000);
    assert.match(embed.fields[0].name, /🤝/);
  });

  test('posts once with an @everyone ping, then leaves an up-to-date post alone', async () => {
    const { client, messages, sends } = setup();
    assert.equal((await publishRulesBoard(client)).status, 'sent');
    assert.equal(sends[0].content, '@everyone');
    assert.deepEqual(sends[0].allowedMentions, { parse: ['everyone'] });
    assert.equal((await publishRulesBoard(client)).status, 'exists');
    assert.equal(messages.size, 1);
    assert.equal(sends.length, 1);
  });

  test('edits an outdated post without pinging again', async () => {
    const { client, messages, sends, post } = setup();
    post({ title: RULES_TITLE, description: 'old rules', fields: [] });
    assert.equal((await publishRulesBoard(client)).status, 'updated');
    assert.equal(messages.size, 1);
    assert.deepEqual(sends[0].allowedMentions, { parse: [] });
    assert.notEqual([...messages.values()][0].embeds[0].description, 'old rules');
  });

  test('reports missing permissions', async () => {
    const { client } = setup({ permissions: [PermissionsBitField.Flags.ViewChannel] });
    await assert.rejects(publishRulesBoard(client), /Missing permissions/);
  });
});
