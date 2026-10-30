import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { isServerOwner } from '../../config/serverOwners.js';
import { isHomeGuild } from '../../config/homeGuild.js';
import { logEvent } from '../../utils/moderation.js';

// `purge` wipes the whole channel. Only the server owners can run it, and only after pressing Confirm.
// In our server (owner's request) it also takes a count and a confirm word, so no confirmation message is
// sent: `purge 50` asks for Confirm and deletes 50 messages, `purge 50 تأكيد` deletes them right away,
// `purge تأكيد` wipes the whole channel right away.
const CONFIRM_WINDOW_MS = 60_000;
const RESULT_DELETE_DELAY_MS = 5_000;

export function isPurgeOwner(userId) {
  return isServerOwner(userId);
}

export function canPurgeChannel(channel) {
  return Boolean(channel?.isTextBased?.() && typeof channel.bulkDelete === 'function');
}

/** Confirm/Cancel buttons for a purge of `channelId`; they expire after one minute. */
export function buildPurgeConfirmation(channelId, limit = null) {
  const expiresAt = Date.now() + CONFIRM_WINDOW_MS;
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`purge_confirm:${channelId}:${expiresAt}${limit ? `:${limit}` : ''}`)
      .setLabel('Confirm')
      .setEmoji('🧹')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`purge_cancel:${channelId}`)
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Secondary),
  );
  return {
    content: `⚠️ **Purge** — سيتم حذف ${limit ? `آخر **${limit}** رسالة من` : 'كل رسائل'} هذه الروم. اضغط Confirm خلال ${CONFIRM_WINDOW_MS / 1000} ثانية.`,
    components: [row],
    allowedMentions: { parse: [] },
  };
}

export function isPurgeConfirmationExpired(expiresAt) {
  return !Number.isFinite(Number(expiresAt)) || Date.now() > Number(expiresAt);
}

/**
 * Bulk-deletes messages Discord allows (messages older than 14 days can't be bulk deleted): every message,
 * or the latest `limit` ones.
 */
export async function purgeChannel(channel, limit = null) {
  let deletedCount = 0;
  let left = limit || Infinity;
  while (left > 0) {
    const batch = await channel.messages.fetch({ limit: Math.min(100, left) });
    if (!batch.size) break;
    const deleted = await channel.bulkDelete(batch, true);
    deletedCount += deleted.size;
    left -= batch.size;
    if (!deleted.size || batch.size < 100) break;
  }
  return deletedCount;
}

export async function sendPurgeResult(channel, deletedCount, limit = null) {
  const result = await channel.send({
    content: `🧹 ${limit ? 'تم الحذف' : 'تم تنظيف الروم بالكامل'}. عدد الرسائل المحذوفة: **${deletedCount}**`,
    allowedMentions: { parse: [] },
  }).catch((error) => {
    logger.debug('Failed to send purge result:', error);
    return null;
  });
  if (result) setTimeout(() => result.delete().catch(() => {}), RESULT_DELETE_DELAY_MS);
}

const CONFIRM_WORDS = new Set(['تأكيد', 'تاكيد', 'confirm', 'sure']);
const MAX_PURGE_COUNT = 1000;

/** Reads `purge` arguments: a count (1-1000) and the confirm word, in any order. Null when something else is there. */
export function parsePurgeArgs(args = []) {
  let limit = null;
  let confirmed = false;
  for (const word of args) {
    if (CONFIRM_WORDS.has(String(word).toLowerCase())) confirmed = true;
    else if (/^\d+$/u.test(word) && limit === null) limit = Number(word);
    else return null;
  }
  if (limit !== null && (limit < 1 || limit > MAX_PURGE_COUNT)) return null;
  return { limit, confirmed };
}

/** Deletes `limit` messages (or all of them) and logs it. Used by the confirm button and by `purge … تأكيد`. */
export async function runPurge(channel, { client, guild, executor, limit = null }) {
  const deletedCount = await purgeChannel(channel, limit);
  await sendPurgeResult(channel, deletedCount, limit);
  await logEvent({
    client,
    guild,
    event: {
      action: 'Channel Purged',
      target: `${channel} (${deletedCount} messages)`,
      executor: `${executor.tag} (${executor.id})`,
      reason: `Purged ${deletedCount} messages`,
      metadata: { channelId: channel.id, messageCount: deletedCount, moderatorId: executor.id },
    },
  }).catch(() => {});
  return deletedCount;
}

/**
 * Prefix/no-prefix `purge`: owner only, and it asks for confirmation first. In our server it also takes a
 * count and a confirm word (see the top of the file); elsewhere the arguments are ignored.
 */
export async function handlePurgeMessage(message, args = []) {
  if (!isPurgeOwner(message.author.id)) {
    const denied = await message.channel.send('🚫 Owner Only').catch(() => null);
    if (denied) setTimeout(() => denied.delete().catch(() => {}), RESULT_DELETE_DELAY_MS);
    return;
  }
  if (!canPurgeChannel(message.channel)) {
    await message.channel.send('❌ Text Channels Only').catch(() => {});
    return;
  }

  const options = isHomeGuild(message.guild?.id) ? parsePurgeArgs(args) : { limit: null, confirmed: false };
  if (!options) {
    const hint = await message.channel.send(`⚠️ الاستخدام: \`purge\` أو \`purge 50\` أو \`purge 50 تأكيد\` (العدد من 1 لـ ${MAX_PURGE_COUNT}).`).catch(() => null);
    if (hint) setTimeout(() => hint.delete().catch(() => {}), RESULT_DELETE_DELAY_MS);
    return;
  }
  if (options.confirmed) {
    // No confirmation message: the command message goes first so the count is the messages before it.
    await message.delete().catch(() => {});
    try {
      await runPurge(message.channel, { client: message.client, guild: message.guild, executor: message.author, limit: options.limit });
    } catch (error) {
      logger.error('Purge error:', error);
      await message.channel.send('❌ Can\'t Purge (Missing Permission)').catch(() => {});
    }
    return;
  }
  await message.channel.send(buildPurgeConfirmation(message.channel.id, options.limit)).catch((error) => {
    logger.error('Failed to send purge confirmation:', error);
  });
}
