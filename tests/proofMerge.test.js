import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { rememberLogMessage, handleProofMessage, buildMergedPayload, buildProofGuideEmbed, PROOF_WINDOW_MS } from '../src/services/moderation/proofMergeService.js';
import { MODERATION_ACTION_LOG_CHANNEL_ID } from '../src/services/moderation/moderationActionLogService.js';

const MOD = '200000000000000001';

function setup() {
  const deleted = [];
  const sent = [];
  const channel = { send: async (payload) => { const m = { id: `m${sent.length}`, payload, delete: async () => deleted.push(`m${sent.length - 1}`) }; sent.push(payload); return m; } };
  const log = { id: 'log', delete: async () => deleted.push('log') };
  const proof = (content, attachments = [], { authorId = MOD } = {}) => ({
    content,
    channelId: MODERATION_ACTION_LOG_CHANNEL_ID,
    guild: { id: 'g' },
    author: { id: authorId, bot: false },
    attachments: new Map(attachments.map((name, i) => [String(i), { url: `https://cdn/x/${name}`, name }])),
    channel,
    delete: async () => deleted.push(`proof:${content}`),
  });
  return { deleted, sent, log, proof };
}

describe('proof channel (report #156)', () => {
  test('the moderator\'s screenshot and text are merged with their log into one message', async () => {
    const { deleted, sent, log, proof } = setup();
    const embed = { title: '⏳ تايم أوت', description: 'العضو...' };
    rememberLogMessage('g', MOD, log, embed, 1000);

    assert.equal(await handleProofMessage(proof('قالي كسمك', ['shot.png']), { now: 2000 }), true);
    assert.deepEqual(deleted, ['log', 'proof:قالي كسمك']);
    const merged = sent[0];
    assert.equal(merged.embeds[0].title, '⏳ تايم أوت');
    assert.deepEqual(merged.embeds[0].fields, [{ name: '📝 الدليل', value: 'قالي كسمك' }]);
    assert.equal(merged.embeds[0].image.url, 'attachment://proof-1-shot.png');
    assert.equal(merged.files[0].attachment, 'https://cdn/x/shot.png');

    // Only the first message is proof (report #164): the next one stays a normal message.
    assert.equal(await handleProofMessage(proof('وكمان ده', ['two.png']), { now: 3000 }), false);
    assert.equal(sent.length, 1);
    // A new log takes a new proof.
    rememberLogMessage('g', MOD, log, embed, 4000);
    assert.equal(await handleProofMessage(proof('دليل تاني'), { now: 5000 }), true);
    assert.equal(sent.length, 2);
  });

  test('other people, other channels, empty messages and late proof are left alone', async () => {
    const { log, proof } = setup();
    rememberLogMessage('g', MOD, log, { title: 'x' }, 1000);
    assert.equal(await handleProofMessage(proof('مش انا', [], { authorId: '999' }), { now: 1500 }), false);
    assert.equal(await handleProofMessage({ ...proof('روم تاني'), channelId: '1' }, { now: 1500 }), false);
    assert.equal(await handleProofMessage(proof('   '), { now: 1500 }), false);
    assert.equal(await handleProofMessage(proof('متأخر'), { now: 1000 + PROOF_WINDOW_MS + 1 }), false);
  });

  test('payload without proof text has no field; the guide explains the steps', () => {
    const payload = buildMergedPayload({ title: 't' }, [], [{ attachment: 'u', name: 'proof-1-a.jpg' }]);
    assert.equal(payload.embeds[0].fields.length, 0);
    assert.equal(payload.embeds[0].image.url, 'attachment://proof-1-a.jpg');
    const guide = buildProofGuideEmbed();
    assert.match(guide.description, /رسالة واحدة/u);
  });
});
