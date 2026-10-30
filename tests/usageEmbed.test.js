import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildPrefixUsageEmbed, typedCommandLabel } from '../src/utils/responseCoordinator.js';
import { mapArgumentsToOptions } from '../src/utils/prefixParser.js';

async function usageEmbedFor(file, args, typed, prefix = '!') {
  const { default: command } = await import(file);
  const validation = mapArgumentsToOptions(args, command.data).validateRequired();
  assert.equal(validation.valid, false);
  return buildPrefixUsageEmbed(prefix, command.data, validation, typed);
}

describe('prefix usage embed', () => {
  test('timeout typed alone shows the usage, units, default and max', async () => {
    const embed = await usageEmbedFor('../src/commands/Moderation/timeout.js', [], 'تايم');
    assert.equal(embed.title, '⏱️ أمر التايم أوت');
    assert.equal(embed.description, 'يمنع العضو من الكتابة والكلام لمدة معينة.');
    assert.equal(embed.fields[0].name, '📌 الاستخدام');
    assert.match(embed.fields[0].value, /تايم @العضو \[المدة\] \[السبب\]/u);
    assert.deepEqual(embed.fields.slice(1).map((field) => field.name), ['⏳ الوحدات', '🕒 الافتراضي', '🔝 الأقصى']);
    assert.ok(embed.fields.slice(1).every((field) => field.inline));
    assert.match(embed.footer.text, /ريبلاي/u);
  });

  test('a wrong member value shows the same embed', async () => {
    const embed = await usageEmbedFor('../src/commands/Moderation/timeout.js', ['الغداء'], 'تايم');
    assert.equal(embed.title, '⏱️ أمر التايم أوت');
  });

  test('commands without Arabic text fall back to the command description and typed name', async () => {
    const embed = await usageEmbedFor('../src/commands/Moderation/untimeout.js', [], '!untimeout');
    assert.equal(embed.title, '🔈 أمر فك التايم');
    const { default: say } = await import('../src/commands/Moderation/say.js');
    const validation = mapArgumentsToOptions([], say.data).validateRequired();
    const sayEmbed = buildPrefixUsageEmbed('!', { ...say.data.toJSON(), name: 'unknown' }, validation, '!unknown');
    assert.equal(sayEmbed.title, '📌 أمر unknown');
    assert.equal(sayEmbed.description, say.data.description);
    assert.equal(sayEmbed.footer, undefined);
  });

  test('custom args replace the generated placeholders', async () => {
    const embed = await usageEmbedFor('../src/commands/Moderation/unban.js', [], 'انبان');
    assert.match(embed.fields[0].value, /انبان ID \[السبب\]/u);
  });

  test('two-word commands keep both words', () => {
    assert.equal(typedCommandLabel('ماس بان'), 'ماس بان');
    assert.equal(typedCommandLabel('تايم الغداء'), 'تايم');
    assert.equal(typedCommandLabel(''), null);
  });
});
