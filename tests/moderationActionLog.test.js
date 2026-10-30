import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildModerationActionLogEmbed, fetchRepliedMessage } from '../src/services/moderation/moderationActionLogService.js';
import { NO_REASON } from '../src/utils/moderationCard.js';

const target = { id: '111111111111111111', tag: 'target', displayAvatarURL: () => 'https://cdn/avatar.png' };
const moderator = { id: '222222222222222222', tag: 'mod' };

describe('moderation action log', () => {
  test('shows the member, moderator, reason and duration', () => {
    const embed = buildModerationActionLogEmbed({ action: 'timeout', targetUser: target, moderatorUser: moderator, reason: 'سبام', durationMs: 15 * 60_000 });
    assert.equal(embed.title, '⏳ تايم أوت');
    assert.match(embed.description, /\*\*العضو:\*\* <@111111111111111111> \(target - 111111111111111111\)/);
    assert.match(embed.description, /\*\*الإداري:\*\* <@222222222222222222> \(mod - 222222222222222222\)/);
    assert.match(embed.description, /\*\*السبب:\*\* سبام/);
    assert.match(embed.description, /\*\*المدة:\*\* 15m/);
    assert.doesNotMatch(embed.description, /ريبلاي/);
    assert.equal(embed.thumbnail.url, 'https://cdn/avatar.png');
  });

  test('falls back to the no-reason text', () => {
    const embed = buildModerationActionLogEmbed({ action: 'ban', targetUser: target, moderatorUser: moderator, reason: 'No reason provided' });
    assert.match(embed.description, new RegExp(`\\*\\*السبب:\\*\\* ${NO_REASON}`));
  });

  test('includes the replied message', () => {
    const repliedMessage = {
      author: target,
      content: 'line one\nline two',
      attachments: new Map([['1', { url: 'https://cdn/file.png' }]]),
      url: 'https://discord.com/channels/1/2/3',
    };
    const embed = buildModerationActionLogEmbed({ action: 'warn', targetUser: target, moderatorUser: moderator, reason: 'x', warnings: 2, repliedMessage });
    assert.match(embed.description, /الرسالة اللي اتعمل عليها ريبلاي/);
    assert.match(embed.description, /> line one\n> line two/);
    assert.match(embed.description, /https:\/\/cdn\/file\.png/);
    assert.match(embed.description, /\(https:\/\/discord\.com\/channels\/1\/2\/3\)/);
    assert.match(embed.description, /\*\*عدد التحذيرات:\*\* 2/);
  });

  test('replied message is only read from prefix commands that reply', async () => {
    assert.equal(await fetchRepliedMessage({}), null);
    assert.equal(await fetchRepliedMessage({ _sourceMessage: { reference: null } }), null);
    const referenced = { content: 'hi' };
    assert.equal(await fetchRepliedMessage({ _sourceMessage: { reference: { messageId: '3' }, fetchReference: async () => referenced } }), referenced);
  });
});
