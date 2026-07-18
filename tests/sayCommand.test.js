import test from 'node:test';
import assert from 'node:assert/strict';
import sayCommand from '../src/commands/owner/say.js';
import { OWNER_INBOX_USER_ID } from '../src/services/ownerInboxService.js';

test('/say is a guild-only command with a required message', () => {
  const data = sayCommand.data.toJSON();
  assert.equal(data.name, 'say');
  assert.equal(data.dm_permission, false);
  assert.equal(data.options.length, 1);
  assert.equal(data.options[0].name, 'message');
  assert.equal(data.options[0].required, true);
  assert.equal(data.options[0].max_length, 2000);
});

test('/say posts only as the bot with every mention type disabled', async () => {
  const sent = [];
  const replies = [];
  const interaction = {
    user: { id: OWNER_INBOX_USER_ID },
    guildId: 'guild-1',
    channelId: 'channel-1',
    channel: {
      isTextBased: () => true,
      send: async payload => {
        sent.push(payload);
        return { id: 'message-1', url: 'https://discord.com/channels/guild-1/channel-1/message-1' };
      },
    },
    options: { getString: () => 'hello @everyone <@123>' },
    deferReply: async payload => replies.push(['defer', payload]),
    editReply: async payload => replies.push(['edit', payload]),
  };

  await sayCommand.execute(interaction);

  assert.equal(sent.length, 1);
  assert.equal(sent[0].content, 'hello @everyone <@123>');
  assert.deepEqual(sent[0].allowedMentions, { parse: [], users: [], roles: [] });
  assert.match(replies.at(-1)[1], /message-1/);
});

test('/say rejects users other than the configured owner', async () => {
  let sent = false;
  let reply;
  await sayCommand.execute({
    user: { id: 'not-owner' },
    channel: { isTextBased: () => true, send: async () => { sent = true; } },
    reply: async payload => { reply = payload; },
  });

  assert.equal(sent, false);
  assert.equal(reply.flags, 64);
});
