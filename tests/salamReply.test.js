import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { HOME_GUILD_ID } from '../src/config/homeGuild.js';
import { isSalam, handleSalam, SALAM_REPLY, SALAM_COOLDOWN_MS } from '../src/services/chat/salamReply.js';

function message(content, { guildId = HOME_GUILD_ID, authorId = '200000000000000001', bot = false } = {}) {
  const replies = [];
  return { content, guild: { id: guildId }, author: { id: authorId, bot }, replies, reply: async (payload) => { replies.push(payload); return {}; } };
}

describe('السلام عليكم → عليكم السلام (report #191)', () => {
  test('knows the greeting in its common spellings, and not a reply to it', () => {
    for (const text of ['السلام عليكم', 'السَّلامُ عَلَيْكُم ورحمة الله وبركاته', 'سلامو عليكو', 'السلاااام عليكمم يا جماعة', 'salam alaikum', 'slm 3lekom']) {
      assert.equal(isSalam(text), true, text);
    }
    for (const text of ['وعليكم السلام', 'عليكم السلام', 'سلامتك', 'السلامة', 'انا قلت السلام عليكم', 'سلام']) {
      assert.equal(isSalam(text), false, text);
    }
  });

  test('replies with a ping, once per member every two minutes', async () => {
    const isTrusted = async () => false;
    const first = message('السلام عليكم', { authorId: '200000000000000011' });
    assert.equal(await handleSalam(first, { now: 1_000, isTrusted }), true);
    assert.deepEqual(first.replies, [{ content: SALAM_REPLY, allowedMentions: { repliedUser: true } }]);
    const again = message('السلام عليكم', { authorId: '200000000000000011' });
    assert.equal(await handleSalam(again, { now: 2_000, isTrusted }), false);
    assert.equal(await handleSalam(message('سلام عليكم', { authorId: '200000000000000011' }), { now: 1_000 + SALAM_COOLDOWN_MS, isTrusted }), true);
    assert.equal(await handleSalam(message('السلام عليكم', { authorId: '200000000000000012' }), { now: 2_000, isTrusted }), true);
    assert.equal(await handleSalam(message('السلام عليكم', { bot: true }), { now: 3_000, isTrusted }), false);
  });

  test('trusted staff and the owner have no cooldown', async () => {
    const trusted = '200000000000000021';
    const isTrusted = async (guild, userId) => userId === trusted;
    for (const now of [1_000, 2_000, 3_000]) {
      assert.equal(await handleSalam(message('السلام عليكم', { authorId: trusted }), { now, isTrusted }), true);
      assert.equal(await handleSalam(message('السلام عليكم', { authorId: '1159601661392715906' }), { now, isTrusted }), true);
    }
  });

  test('another server: no answer', async () => {
    const other = message('السلام عليكم', { guildId: '100000000000000099', authorId: '200000000000000013' });
    assert.equal(await handleSalam(other), false);
    assert.equal(other.replies.length, 0);
  });
});
