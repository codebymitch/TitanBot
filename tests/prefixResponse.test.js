import test from 'node:test';
import assert from 'node:assert/strict';

import banCommand from '../src/commands/Moderation/ban.js';
import warnCommand from '../src/commands/Moderation/warn.js';
import { ResponseCoordinator, buildPrefixUsage } from '../src/utils/responseCoordinator.js';
import { executePrefixCommand, createMockInteraction } from '../src/utils/messageAdapter.js';

const banData = banCommand.default?.data || banCommand.data || banCommand;
const warnData = warnCommand.default?.data || warnCommand.data || warnCommand;

function createMockMessage(content = '!ban') {
  const sentMessages = [];

  const channel = {
    send: async (payload) => {
      sentMessages.push(payload);
      return {
        id: `msg-${sentMessages.length}`,
        edit: async (editPayload) => {
          sentMessages[sentMessages.length - 1] = editPayload;
          return sentMessages[sentMessages.length - 1];
        },
        deletable: true,
        delete: async () => {},
      };
    },
  };

  const message = {
    id: 'trigger-msg',
    content,
    author: { id: 'user-1', tag: 'User#0001', bot: false, toString: () => '<@user-1>' },
    member: { permissions: { has: () => true } },
    guild: { id: 'guild-1', members: { cache: new Map(), fetch: async () => null } },
    channel,
    client: { config: { bot: { prefix: '!' } } },
    createdTimestamp: Date.now(),
    createdAt: new Date(),
    deletable: false,
  };

  return { message, sentMessages, channel };
}

test('buildPrefixUsage formats empty ban command args', () => {
  const options = { subcommandName: null, subcommandGroupName: null, optionDefs: banData.options.map((opt) => ({ name: opt.name, required: opt.required })) };
  const usage = buildPrefixUsage('!', banData, options);
  assert.equal(usage, '!ban [target] [reason]');
});

function getEmbedTitle(payload) {
  const embed = payload.embeds?.[0];
  return embed?.data?.title ?? embed?.title ?? '';
}

function getEmbedDescription(payload) {
  const embed = payload.embeds?.[0];
  return embed?.data?.description ?? embed?.description ?? '';
}

test('ResponseCoordinator respondUsage finalizes and blocks second respond', async () => {
  const { message, sentMessages } = createMockMessage();
  const interaction = { replied: false, deferred: false, _isPrefixCommand: true, _replyMessage: null };
  const coordinator = ResponseCoordinator.attach(interaction, { message });

  await coordinator.respondUsage('!ban [target] [reason]');
  assert.equal(sentMessages.length, 1);
  assert.match(getEmbedTitle(sentMessages[0]), /Wrong usage/);
  assert.equal(coordinator.isUsageFinalized(), true);

  await coordinator.respond({ content: 'should not send' });
  assert.equal(sentMessages.length, 1);
});

test('ResponseCoordinator second respond edits existing message', async () => {
  const { message, sentMessages } = createMockMessage();
  const interaction = { replied: false, deferred: false, _isPrefixCommand: true, _replyMessage: null };
  const coordinator = ResponseCoordinator.attach(interaction, { message });

  await coordinator.respond({ content: 'first' });
  await coordinator.respond({ content: 'second' });
  assert.equal(sentMessages.length, 1);
  assert.equal(sentMessages[0].content, 'second');
});

test('executePrefixCommand sends exactly one usage embed for !ban with no args', async () => {
  const { message, sentMessages } = createMockMessage('!ban');
  const command = { data: banData, execute: banCommand.default?.execute || banCommand.execute, category: 'moderation' };

  await executePrefixCommand(command, message, [], message.client, '!');

  assert.equal(sentMessages.length, 1);
  assert.match(getEmbedTitle(sentMessages[0]), /Wrong usage/);
  assert.match(getEmbedDescription(sentMessages[0]), /!ban \[target\] \[reason\]/);
});

test('executePrefixCommand sends exactly one usage embed for !warn with no args', async () => {
  const { message, sentMessages } = createMockMessage('!warn');
  const command = { data: warnData, execute: warnCommand.default?.execute || warnCommand.execute, category: 'moderation' };

  await executePrefixCommand(command, message, [], message.client, '!');

  assert.equal(sentMessages.length, 1);
  assert.match(getEmbedTitle(sentMessages[0]), /Wrong usage/);
  assert.match(getEmbedDescription(sentMessages[0]), /!warn \[target\] \[reason\]/);
});

test('ResponseCoordinator edit after defer sends without recursion for prefix commands', async () => {
  const { message, sentMessages } = createMockMessage();
  const mockInteraction = createMockInteraction(message, banData, []);

  await mockInteraction.deferReply();
  await mockInteraction.editReply({ content: 'balance result' });

  assert.equal(sentMessages.length, 1);
  assert.equal(sentMessages[0].content, 'balance result');
});

test('createMockInteraction routes command reply through coordinator without duplicate sends', async () => {
  const { message, sentMessages } = createMockMessage('!ban');
  const mockInteraction = createMockInteraction(message, banData, []);

  await mockInteraction._responseCoordinator.respondUsage('!ban [target] [reason]');
  await mockInteraction.reply({ content: 'duplicate attempt' });

  assert.equal(sentMessages.length, 1);
  assert.equal(coordinatorUsageFinalized(mockInteraction), true);
});

function coordinatorUsageFinalized(interaction) {
  return interaction._responseCoordinator?.isUsageFinalized() === true;
}
