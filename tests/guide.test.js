import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildGuideEmbeds } from '../src/services/cc/guideUi.js';
import guide from '../src/commands/Games/guide.js';
import { commandAliases, standaloneOnlyAliases } from '../src/config/commands/commandAliases.js';
import { bourseSettings } from '../src/config/store/bourse.js';
import { CC } from '../src/config/cc.js';
import { HOME_GUILD_ID } from '../src/config/homeGuild.js';

describe('شرح: the CC / store / bourse guide in DM', () => {
  test('covers CC, earning, the store, the bourse and transfers with the real numbers', () => {
    const embeds = buildGuideEmbeds({ boostLine: '' });
    const text = JSON.stringify(embeds);
    for (const word of ['رصيد', 'متجر', 'مخزني', 'اسعار', 'شراء عربية', 'استثمار عربية', 'بيع عربية', 'ممتلكاتي', 'تحويل']) {
      assert.ok(text.includes(word), word);
    }
    assert.ok(text.includes(`${bourseSettings.maxMovePercent}%`));
    assert.ok(text.includes(`${bourseSettings.demand.guaranteedRiseUnits} قطعة`));
    assert.ok(text.includes(`**${CC.gamesBot.win}**`));
    // Our server's guide shows its own game rewards (report #181).
    assert.ok(JSON.stringify(buildGuideEmbeds({ boostLine: '', guildId: HOME_GUILD_ID })).includes(`**${CC.gamesBot.home.win}**`));
    assert.ok(embeds.length <= 10 && text.length < 6000);
  });

  test('`شرح` runs the guide only as the whole message', () => {
    assert.equal(commandAliases['شرح'], 'guide');
    assert.ok(standaloneOnlyAliases.has('شرح'));
  });

  test('sends the guide in DM and says so; tells the member when their DMs are closed', async () => {
    const replies = [];
    const dms = [];
    const interaction = (send) => ({
      user: { id: 'u', send },
      deferred: false,
      replied: false,
      reply: async (payload) => { replies.push(payload); },
      isRepliable: () => true,
    });
    await guide.execute(interaction(async (payload) => { dms.push(payload); }));
    assert.equal(dms.length, 1);
    assert.ok(dms[0].embeds.length >= 4);

    const notes = [];
    const source = { channel: { send: async (payload) => { notes.push(payload); return { delete: async () => {} }; } }, delete: async () => {} };
    await guide.execute({ ...interaction(async () => { throw new Error('Cannot send messages to this user'); }), _sourceMessage: source, user: { id: 'u', toString: () => '<@u>', send: async () => { throw new Error('closed'); } } });
    assert.match(notes[0].content, /مقدرتش أبعتلك في الخاص/u);
  });
});
