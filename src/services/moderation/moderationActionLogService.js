// moderationActionLogService.js — every ban / timeout / warn issued by a staff member is posted in one
// channel: the member, the moderator, the reason, and the message the command replied to (if any).

import { logger } from '../../utils/logger.js';
import { cardReason, formatDurationMs } from '../../utils/moderationCard.js';
import { NO_PINGS } from '../../utils/oneLine.js';

export const MODERATION_ACTION_LOG_CHANNEL_ID = '1552347336976498898';

const ACTIONS = {
  ban: { title: '🔨 بان', color: 0xe74c3c },
  hardban: { title: '🔨 هارد بان', color: 0x992d22 },
  timeout: { title: '⏳ تايم أوت', color: 0xe67e22 },
  warn: { title: '⚠️ وارن', color: 0xf1c40f },
};

const MAX_MESSAGE_CONTENT = 1000;
const MAX_DESCRIPTION_LENGTH = 4000;

function userLine(user, fallbackId) {
  const id = user?.id || fallbackId;
  return user?.tag ? `<@${id}> (${user.tag} - ${id})` : `<@${id}> (${id})`;
}

/**
 * The message a prefix command replied to (`تايم 5m سبام` as a reply), or null.
 * Call it before the action so the message is captured even if it gets deleted afterwards.
 */
export async function fetchRepliedMessage(interaction) {
  const message = interaction?._sourceMessage;
  if (!message?.reference?.messageId) return null;
  return message.fetchReference().catch(() => null);
}

function repliedMessageText(message) {
  const lines = [`**صاحب الرسالة:** ${userLine(message.author)}`];
  const content = message.content?.trim();
  if (content) {
    const clipped = content.length > MAX_MESSAGE_CONTENT ? `${content.slice(0, MAX_MESSAGE_CONTENT - 3)}...` : content;
    lines.push(clipped.split('\n').map((line) => `> ${line}`).join('\n'));
  } else {
    lines.push('*(بدون نص)*');
  }
  const attachments = [...(message.attachments?.values?.() || [])].map((attachment) => attachment.url);
  if (attachments.length) lines.push(`**المرفقات:**\n${attachments.join('\n')}`);
  if (message.url) lines.push(`[اذهب للرسالة](${message.url})`);
  return lines.join('\n');
}

/**
 * Embed for one moderation action. `action` is one of `ban`, `hardban`, `timeout`, `warn`;
 * `targetUser`/`moderatorUser` are discord.js Users (ids are used when a user could not be fetched).
 */
export function buildModerationActionLogEmbed({
  action, targetUser, targetId, moderatorUser, moderatorId, reason, durationMs, warnings, punishment,
  channel, repliedMessage, timestamp = Date.now(),
}) {
  const { title, color } = ACTIONS[action] || { title: action, color: 0x95a5a6 };
  const lines = [
    `**العضو:** ${userLine(targetUser, targetId)}`,
    `**الإداري:** ${userLine(moderatorUser, moderatorId)}`,
    `**السبب:** ${cardReason(reason)}`,
  ];
  if (durationMs) lines.push(`**المدة:** ${formatDurationMs(durationMs)}`);
  if (warnings) lines.push(`**عدد التحذيرات:** ${warnings}`);
  if (punishment) lines.push(`**العقوبة:** ${punishment}`);
  if (channel) lines.push(`**الروم:** ${channel}`);
  lines.push(`**الوقت:** <t:${Math.floor(timestamp / 1000)}:F>`);
  if (repliedMessage) lines.push('', '**الرسالة اللي اتعمل عليها ريبلاي:**', repliedMessageText(repliedMessage));

  const avatar = targetUser?.displayAvatarURL?.();
  return {
    color,
    title,
    description: lines.join('\n').slice(0, MAX_DESCRIPTION_LENGTH),
    ...(avatar ? { thumbnail: { url: avatar } } : {}),
    timestamp: new Date(timestamp).toISOString(),
  };
}

/** Posts the action in the moderation log channel. Never throws: a missing channel only logs a warning. */
export async function sendModerationActionLog(guild, details) {
  try {
    const channel = guild.channels.cache.get(MODERATION_ACTION_LOG_CHANNEL_ID)
      || await guild.channels.fetch(MODERATION_ACTION_LOG_CHANNEL_ID).catch(() => null);
    if (!channel?.isTextBased?.()) {
      logger.warn(`Moderation action log channel ${MODERATION_ACTION_LOG_CHANNEL_ID} was not found in guild ${guild.id}.`);
      return false;
    }
    const embed = buildModerationActionLogEmbed(details);
    const posted = await channel.send({ embeds: [embed], allowedMentions: NO_PINGS });
    // The moderator's proof sent next in this channel is merged into this log (proofMergeService.js).
    const moderatorId = details.moderatorUser?.id || details.moderatorId;
    if (moderatorId && moderatorId !== guild.client?.user?.id) {
      const { rememberLogMessage } = await import('./proofMergeService.js');
      rememberLogMessage(guild.id, moderatorId, posted, embed);
    }
    return true;
  } catch (error) {
    logger.error('Failed to send moderation action log:', error);
    return false;
  }
}
