import { EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { logger } from '../utils/logger.js';
import { findBoardMessage, rememberBoardMessage } from '../utils/boardMessage.js';

export const MODERATION_COMMANDS_CHANNEL_ID = '1551621505991835699';
const MODERATION_COMMANDS_TITLE = '🛡️ أوامر الموديريشن بالعربي';
// Older versions showed this marker in the message; it is stripped from existing posts.
const LEGACY_MARKER = 'titanbot:arabic-moderation-commands:v1';
const BOARD_KEY = 'moderationCommands';

const PERMISSION_NAMES = [
  [PermissionFlagsBits.ViewChannel, 'ViewChannel'],
  [PermissionFlagsBits.SendMessages, 'SendMessages'],
  [PermissionFlagsBits.EmbedLinks, 'EmbedLinks'],
  [PermissionFlagsBits.ReadMessageHistory, 'ReadMessageHistory'],
];

function buildEmbed() {
  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(MODERATION_COMMANDS_TITLE)
    .setDescription('استخدم الـ prefix قبل الأمر إذا كان مفعّلًا في السيرفر. يمكنك منشن العضو أو الرد على رسالته.')
    .addFields(
      {
        name: '🚫 الحظر والطرد',
        value: [
          '`بان @العضو السبب` — Ban',
          '`انبان ID_العضو` — Unban',
          '`طرد @العضو السبب` — Kick',
          '`هارد بان @العضو ID2 السبب` — Hard ban (فكّه للـ trusted فقط)',
          '`خطر @العضو` — قائمة الخطر: تتشال منه رولات الإدارة، وأي حاجة خطر = تايم أوت أسبوع (`خطر شيل` يشيله ويرجعله رولاته، للـ trusted فقط)',
        ].join('\n'),
      },
      {
        name: '⏱️ التايم والتحذيرات',
        value: [
          '`تايم @العضو 5m السبب` — Timeout',
          '`انتايم @العضو` — Remove timeout',
          '`تحذير @العضو السبب` — Warn',
          '`تحذيرات @العضو` — Warnings',
          '`مسح تحذيرات @العضو` — Clear warnings',
          '> كل 3 تحذيرات = تايم تلقائي 15m، ويتضاعف كل 3 (30m، 1h، …)',
          '> التحذير يُحذف تلقائياً بعد 5 أيام',
        ].join('\n'),
      },
      {
        name: '🔧 إدارة الرومات والبيانات',
        value: [
          '`قفل` — Lock channel',
          '`فتح` — Unlock channel',
          '`مسح 10` / `م 10` — Delete messages',
          '`ملاحظات @العضو` — User notes',
          '`ملاحظات @العضو الملاحظة` — Add a note',
          '`قل @العضو النص` — Say as the bot',
          '`خاص @العضو النص` — DM user',
        ].join('\n'),
      },
    );
}

/** What the list shows: title, description and every field. Any difference triggers an edit. */
function embedSignature(embed) {
  return JSON.stringify({
    title: embed?.title || '',
    description: embed?.description || '',
    color: embed?.color ?? null,
    fields: (embed?.fields || []).map(({ name, value }) => ({ name, value })),
  });
}

/**
 * Keeps the Arabic moderation commands list in its channel up to date by editing the existing post.
 * A new post is only sent with `allowSend` (the /publish-board command); startup never posts.
 * Returns { status, channelId } where status is 'sent', 'updated', 'exists' or 'missing'; throws on failure.
 */
export async function publishArabicModerationCommands(client, { allowSend = false } = {}) {
  const channel = await client.channels.fetch(MODERATION_COMMANDS_CHANNEL_ID).catch((error) => {
    throw new Error(`Channel ${MODERATION_COMMANDS_CHANNEL_ID} could not be fetched (is the bot in that server?): ${error.message}`);
  });
  if (!channel?.isTextBased?.() || !channel.messages?.fetch || !channel.guild) {
    throw new Error(`Channel ${MODERATION_COMMANDS_CHANNEL_ID} is not a server text channel`);
  }

  const botMember = channel.guild.members.me || await channel.guild.members.fetchMe().catch(() => null);
  const permissions = botMember ? channel.permissionsFor(botMember) : null;
  const missing = PERMISSION_NAMES.filter(([flag]) => !permissions?.has(flag)).map(([, name]) => name);
  if (missing.length) {
    throw new Error(`Missing permissions in channel ${MODERATION_COMMANDS_CHANNEL_ID}: ${missing.join(', ')}`);
  }

  // Only the owner and the bot can post here, so any embed from the bot is the list, whatever its title.
  const existing = await findBoardMessage(channel, BOARD_KEY, (message) => (
    message.embeds.length > 0 || message.content?.includes(LEGACY_MARKER)
  ));
  if (existing) {
    // Keep the posted list in sync with the code (new commands, removed legacy marker).
    const embed = buildEmbed();
    const outdated = existing.content?.includes(LEGACY_MARKER)
      || Boolean(existing.embeds[0]?.footer?.text)
      || embedSignature(existing.embeds[0]) !== embedSignature(embed.data);
    if (outdated) {
      await existing.edit({ content: '', embeds: [embed] });
      return { status: 'updated', channelId: channel.id };
    }
    return { status: 'exists', channelId: channel.id };
  }
  if (!allowSend) {
    logger.warn(`Arabic moderation commands message not found in channel ${MODERATION_COMMANDS_CHANNEL_ID}; use /publish-board moderation-commands to post it`);
    return { status: 'missing', channelId: channel.id };
  }

  const sent = await channel.send({ embeds: [buildEmbed()] });
  await rememberBoardMessage(channel, BOARD_KEY, sent.id);
  logger.info(`Published Arabic moderation commands in channel ${MODERATION_COMMANDS_CHANNEL_ID}`);
  return { status: 'sent', channelId: channel.id };
}
