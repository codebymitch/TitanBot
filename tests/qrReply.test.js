import { fileURLToPath } from 'node:url';
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { HOME_GUILD_ID } from '../src/config/homeGuild.js';
import { isQrRequest, handleQr, QR_LINK, QR_FILE, QR_COOLDOWN_MS } from '../src/services/chat/qrReply.js';

function message(content, { guildId = HOME_GUILD_ID, authorId = '200000000000000001', bot = false } = {}) {
  const replies = [];
  return { content, guild: { id: guildId }, author: { id: authorId, bot }, replies, reply: async (payload) => { replies.push(payload); return {}; } };
}

describe('qr → QR code of the guns.lol page', () => {
  test('only a message that is just "qr" counts', () => {
    for (const text of ['qr', 'QR', ' Qr ', '!qr']) assert.equal(isQrRequest(text), true, text);
    for (const text of ['qr code', 'give me qr', 'qrs', 'q r', '', 'سلام']) assert.equal(isQrRequest(text), false, text);
  });

  test('the image is kept in the bot and is a PNG', () => {
    assert.equal(QR_LINK, 'https://guns.lol/0skar');
    assert.equal(existsSync(fileURLToPath(QR_FILE)), true);
    assert.equal(readFileSync(fileURLToPath(QR_FILE)).subarray(1, 4).toString(), 'PNG');
  });

  test('replies with the image and the link, once per member every ten seconds', async () => {
    const first = message('qr', { authorId: '200000000000000011' });
    assert.equal(await handleQr(first, { now: 1_000 }), true);
    assert.equal(first.replies.length, 1);
    assert.equal(first.replies[0].content, QR_LINK);
    assert.equal(first.replies[0].files.length, 1);
    assert.equal(await handleQr(message('qr', { authorId: '200000000000000011' }), { now: 2_000 }), false);
    assert.equal(await handleQr(message('QR', { authorId: '200000000000000011' }), { now: 1_000 + QR_COOLDOWN_MS }), true);
    assert.equal(await handleQr(message('qr', { authorId: '200000000000000012' }), { now: 2_000 }), true);
    assert.equal(await handleQr(message('qr', { bot: true }), { now: 3_000 }), false);
  });

  test('another server: no answer', async () => {
    const other = message('qr', { guildId: '100000000000000099', authorId: '200000000000000013' });
    assert.equal(await handleQr(other), false);
    assert.equal(other.replies.length, 0);
  });
});
