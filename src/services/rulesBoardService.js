import { PermissionFlagsBits } from 'discord.js';
import { findBoardMessage, rememberBoardMessage } from '../utils/boardMessage.js';

export const RULES_CHANNEL_ID = '1547311665458978990';
export const RULES_TITLE = '📜 ━━━ قوانين السيرفر ━━━ 📜';
const BOARD_KEY = 'rules';
const RULES_COLOR = 0xf1c40f;

const PERMISSION_NAMES = [
  [PermissionFlagsBits.ViewChannel, 'ViewChannel'],
  [PermissionFlagsBits.SendMessages, 'SendMessages'],
  [PermissionFlagsBits.EmbedLinks, 'EmbedLinks'],
  [PermissionFlagsBits.ReadMessageHistory, 'ReadMessageHistory'],
  [PermissionFlagsBits.MentionEveryone, 'MentionEveryone'],
];

export const RULES_SECTIONS = [
  {
    name: '🤝 ┃ الاحترام',
    rules: [
      'احترم كل الأعضاء والستاف، ممنوع الشتيمة والسب والتنمر.',
      'ممنوع العنصرية أو الكلام المسيء عن الدين أو السياسة أو الأصل.',
      'ممنوع التهديد أو نشر معلومات شخصية لأي حد.',
      'الخلافات الشخصية تتحل في الخاص أو في تكت، مش في الشات العام.',
    ],
  },
  {
    name: '💬 ┃ الشات',
    rules: [
      'ممنوع السبام.',
      'ممنوع أي محتوى +18 أو دموي، سواء في الرسائل أو الصور أو الأسماء.',
      'استخدم كل روم في الغرض بتاعه.',
    ],
  },
  {
    name: '🔗 ┃ الإعلانات والروابط',
    rules: [
      'ممنوع نشر روابط سيرفرات تانية أو أي إعلان، في الشات أو في الخاص.',
    ],
  },
  {
    name: '🎙️ ┃ الفويس',
    rules: [
      'ممنوع الإزعاج في الفويس.',
      'ممنوع تسجيل الفويس من غير موافقة.',
    ],
  },
  {
    name: '🛡️ ┃ الستاف والعقوبات',
    rules: [
      'قرار الستاف نهائي، ولو عندك اعتراض افتح تكت.',
      'ممنوع انتحال شخصية حد.',
      'كل 3 تحذيرات = تايم أوت 15 دقيقة، والمدة بتتضاعف كل 3 تحذيرات بعد كده.',
      'التحذير بيتمسح بعد 5 أيام، والمخالفات الكبيرة ممكن توصل لبان على طول.',
      'الالتزام بشروط ديسكورد.',
    ],
  },
];

const DIVIDER = '━━━━━━━━━━━━━━━━━━━━';

/**
 * A plain embed object rather than an EmbedBuilder: src/utils/embeds.js strips emojis from builder
 * titles, fields and descriptions, and the section icons are part of the look.
 * Rules are numbered across sections so members can point to one ("rule 7").
 */
export function buildRulesEmbed(guild) {
  let number = 0;
  const fields = RULES_SECTIONS.map(({ name, rules }) => ({
    name,
    value: rules.map((rule) => `\`${String(++number).padStart(2, '0')}\` ${rule}`).join('\n'),
  }));
  fields.push({
    name: '⚠️ ┃ تنبيه',
    value: [
      '> وجودك في السيرفر معناه إنك موافق على القوانين دي، وعدم معرفتك بيها مش عذر.',
      '> القوانين دي مش كل حاجة، وأي غلط مش مكتوب هنا **مش معناه إنه مسموح**. كلنا عارفين الصح من الغلط، والستاف هيتصرف مع أي تصرف مش مقبول.',
      '> أي مشكلة أو شكوى؟ افتح تكت 🎫 والستاف هيساعدك.',
    ].join('\n'),
  });

  const embed = {
    title: RULES_TITLE,
    description: `أهلاً بيك في السيرفر 👋\nعشان المكان يفضل محترم وممتع للكل، الالتزام بالقوانين دي **إجباري**.\n${DIVIDER}`,
    color: RULES_COLOR,
    fields,
    footer: { text: `${guild?.name || 'السيرفر'} • القوانين ممكن تتحدث في أي وقت` },
  };
  const icon = guild?.iconURL?.({ size: 256 });
  if (icon) embed.thumbnail = { url: icon };
  return embed;
}

function embedSignature(embed) {
  return JSON.stringify({
    title: embed?.title || '',
    description: embed?.description || '',
    color: embed?.color ?? null,
    footer: embed?.footer?.text || '',
    fields: (embed?.fields || []).map(({ name, value }) => ({ name, value })),
  });
}

/**
 * Posts the rules in the rules channel with an @everyone ping, or edits the bot's existing rules post
 * there so it matches the code (edits never ping again).
 * Returns { status, channelId } where status is 'sent', 'updated' or 'exists'; throws on failure.
 */
export async function publishRulesBoard(client) {
  const channel = await client.channels.fetch(RULES_CHANNEL_ID).catch((error) => {
    throw new Error(`Channel ${RULES_CHANNEL_ID} could not be fetched (is the bot in that server?): ${error.message}`);
  });
  if (!channel?.isTextBased?.() || !channel.messages?.fetch || !channel.guild) {
    throw new Error(`Channel ${RULES_CHANNEL_ID} is not a server text channel`);
  }

  const botMember = channel.guild.members.me || await channel.guild.members.fetchMe().catch(() => null);
  const permissions = botMember ? channel.permissionsFor(botMember) : null;
  const missing = PERMISSION_NAMES.filter(([flag]) => !permissions?.has(flag)).map(([, name]) => name);
  if (missing.length) {
    throw new Error(`Missing permissions in <#${channel.id}>: ${missing.join(', ')}`);
  }

  const embed = buildRulesEmbed(channel.guild);
  const existing = await findBoardMessage(channel, BOARD_KEY, (message) => message.embeds[0]?.title === RULES_TITLE);
  if (existing) {
    if (embedSignature(existing.embeds[0]) === embedSignature(embed)) return { status: 'exists', channelId: channel.id };
    await existing.edit({ content: '@everyone', embeds: [embed], allowedMentions: { parse: [] } });
    return { status: 'updated', channelId: channel.id };
  }

  const sent = await channel.send({ content: '@everyone', embeds: [embed], allowedMentions: { parse: ['everyone'] } });
  await rememberBoardMessage(channel, BOARD_KEY, sent.id);
  return { status: 'sent', channelId: channel.id };
}
