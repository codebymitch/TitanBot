// usageHelp.js — the Arabic text for the usage embed a prefix command shows when it is typed without its
// required options (`تايم`) or with a wrong one (`تايم الغداء`). Commands missing here fall back to the
// slash command description.
//
// `emoji` and `title` head the embed, `description` sits under the title, `args` replaces the generated
// option placeholders and `fields` are extra `[name, value]` pairs shown side by side under the usage line.

export const usageHelp = {
  ban: { emoji: '🔨', title: 'أمر البان', description: 'يبند العضو من السيرفر.' },
  unban: { emoji: '🔓', title: 'أمر فك البان', description: 'يفك البان عن عضو بالـ ID بتاعه.', args: 'ID [السبب]' },
  kick: { emoji: '👢', title: 'أمر الطرد', description: 'يطرد العضو من السيرفر.' },
  timeout: {
    emoji: '⏱️',
    title: 'أمر التايم أوت',
    description: 'يمنع العضو من الكتابة والكلام لمدة معينة.',
    fields: [
      ['⏳ الوحدات', '`m` `h` `d` `w`\n`د` `س` `ي`'],
      ['🕒 الافتراضي', '15 دقيقة'],
      ['🔝 الأقصى', '28 يوم'],
    ],
  },
  untimeout: { emoji: '🔈', title: 'أمر فك التايم', description: 'يفك التايم أوت عن العضو.' },
  warn: { emoji: '⚠️', title: 'أمر التحذير', description: 'يدي العضو تحذير، وكل 3 تحذيرات بتدي تايم أوت تلقائي.' },
  warnings: { emoji: '📋', title: 'أمر التحذيرات', description: 'يعرض كل تحذيرات العضو.' },
  clear: {
    emoji: '🧹',
    title: 'أمر المسح',
    description: 'يمسح عدد من الرسايل في الروم.',
    fields: [['🔢 العدد', 'من 1 لـ 100']],
  },
  massban: { emoji: '🔨', title: 'أمر الهارد بان', description: 'يبند كذا عضو مرة واحدة، والبان ده مايتفكش غير من التراستد.' },
  masskick: { emoji: '👢', title: 'أمر الطرد الجماعي', description: 'يطرد كذا عضو مرة واحدة.' },
  usernotes: { emoji: '🗒️', title: 'أمر الملاحظات', description: 'ملاحظات الإدارة على الأعضاء.' },
  say: { emoji: '💬', title: 'أمر قول', description: 'البوت يبعت رسالة باسمه.' },
  dm: { emoji: '✉️', title: 'أمر الخاص', description: 'يبعت رسالة خاصة للعضو من البوت.' },
  play: { emoji: '🎵', title: 'أمر التشغيل', description: 'يشغل أغنية أو لينك أو بلاي ليست.', args: 'اسم الأغنية أو اللينك' },
  xo: { emoji: '❌', title: 'لعبة XO', description: 'العب XO ضد عضو تاني.' },
  game: { emoji: '🎮', title: 'الألعاب الجماعية', description: 'اكتب `العاب` عشان تشوف كل الألعاب وأوامرها.', args: 'اسم اللعبة' },
  solo: { emoji: '🙋', title: 'الألعاب الفردية', description: 'اكتب `سؤال` أو `رقم` أو `سلوت`.', args: 'اسم اللعبة' },
};
