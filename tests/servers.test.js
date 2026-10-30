import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import command, { buildServersList } from '../src/commands/Core/servers.js';
import { HOME_GUILD_ID } from '../src/config/homeGuild.js';
import { SERVER_OWNER_IDS } from '../src/config/serverOwners.js';

function run({ guildId, userId }) {
  const replies = [];
  const interaction = {
    id: 'i1',
    guildId,
    user: { id: userId },
    client: { guilds: { cache: new Map([['1', { id: '1', name: 'A', memberCount: 5 }], ['2', { id: '2', name: 'B', memberCount: 9 }]]) } },
    deferred: false,
    replied: false,
    reply: async (p) => { replies.push(p); interaction.replied = true; },
  };
  return command.execute(interaction).then(() => replies);
}

describe('/servers', () => {
  test('lists servers, biggest first', () => {
    const text = buildServersList([{ id: '1', name: 'A', memberCount: 5 }, { id: '2', name: 'B', memberCount: 9 }]);
    assert.ok(text.indexOf('B') < text.indexOf('A'));
  });

  test('owner in the home server gets the list', async () => {
    const replies = await run({ guildId: HOME_GUILD_ID, userId: SERVER_OWNER_IDS[0] });
    assert.match(String(replies[0]?.content), /2 سيرفر/);
  });

  test('non-owner and other servers are refused', async () => {
    const a = await run({ guildId: HOME_GUILD_ID, userId: '999' });
    const b = await run({ guildId: '555', userId: SERVER_OWNER_IDS[0] });
    assert.doesNotMatch(String(a[0]?.content), /سيرفر:/);
    assert.doesNotMatch(String(b[0]?.content), /سيرفر:/);
  });
});
