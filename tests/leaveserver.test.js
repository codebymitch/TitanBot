import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import command from '../src/commands/Core/leaveserver.js';
import { HOME_GUILD_ID } from '../src/config/homeGuild.js';
import { SERVER_OWNER_IDS } from '../src/config/serverOwners.js';

async function run({ guildId = HOME_GUILD_ID, userId = SERVER_OWNER_IDS[0], target }) {
  const replies = [];
  let left = false;
  const interaction = {
    id: 'i1', guildId, user: { id: userId }, deferred: false, replied: false,
    options: { getString: () => target },
    client: { guilds: { cache: new Map([['777', { name: 'X', leave: async () => { left = true; } }]]) } },
    reply: async (p) => { replies.push(p); interaction.replied = true; },
  };
  await command.execute(interaction);
  return { text: String(replies[0]?.content), left };
}

describe('/leaveserver', () => {
  test('owner in the home server leaves a server', async () => {
    const r = await run({ target: '777' });
    assert.equal(r.left, true);
  });
  test('refuses non-owners, other servers, our own server and unknown IDs', async () => {
    assert.equal((await run({ target: '777', userId: '1' })).left, false);
    assert.equal((await run({ target: '777', guildId: '555' })).left, false);
    assert.equal((await run({ target: HOME_GUILD_ID })).left, false);
    assert.match((await run({ target: '888' })).text, /مش في السيرفر/);
  });
});
