// warnEscalation.js — issuing a warning plus the automatic timeout it can trigger.
//
// Every 3 active warnings the member is timed out: 15m at 3, 30m at 6, 1h at 9, and the time keeps
// doubling for every further 3 (capped at Discord's 28 day maximum). Warnings expire after 5 days
// (see WarningService), so the count only includes warnings from the last 5 days.

import { WarningService } from './warningService.js';
import { ModerationService } from './moderationService.js';
import { logger } from '../../utils/logger.js';
import { moderationCard, cardReason, formatDurationMs } from '../../utils/moderationCard.js';

export const WARNINGS_PER_TIMEOUT = 3;
export const BASE_WARN_TIMEOUT_MS = 15 * 60_000;
export const MAX_TIMEOUT_MS = 28 * 24 * 60 * 60_000;

/** Timeout length for the given active warning count, or 0 when this warning does not trigger one. */
export function getWarnTimeoutMs(warningCount) {
  if (!Number.isInteger(warningCount) || warningCount < WARNINGS_PER_TIMEOUT || warningCount % WARNINGS_PER_TIMEOUT !== 0) return 0;
  const step = warningCount / WARNINGS_PER_TIMEOUT - 1;
  return Math.min(BASE_WARN_TIMEOUT_MS * 2 ** step, MAX_TIMEOUT_MS);
}

/** The warning count at which the next automatic timeout happens (3, 6, 9, …). */
export function getNextTimeoutThreshold(warningCount) {
  const count = Math.max(0, Number(warningCount) || 0);
  return Math.max(WARNINGS_PER_TIMEOUT, Math.ceil(count / WARNINGS_PER_TIMEOUT) * WARNINGS_PER_TIMEOUT);
}

/**
 * Adds a warning for `member` and applies the automatic timeout when the count reaches a multiple of 3.
 * `moderator` is the GuildMember who issued the warning. Hierarchy checks are the caller's job.
 */
export async function issueWarning({ guild, member, moderator, reason }) {
  const finalReason = cardReason(reason);
  const { id, totalCount } = await WarningService.addWarning({
    guildId: guild.id,
    userId: member.id,
    moderatorId: moderator.id,
    reason: finalReason,
  });

  const timeoutMs = getWarnTimeoutMs(totalCount);
  let timeoutApplied = false;
  let timeoutError = null;
  if (timeoutMs) {
    try {
      await ModerationService.timeoutUser({
        guild,
        member,
        moderator,
        durationMs: timeoutMs,
        reason: `Auto timeout: ${totalCount} warnings (${formatDurationMs(timeoutMs)}) — ${finalReason}`,
      });
      timeoutApplied = true;
    } catch (error) {
      timeoutError = error?.userMessage || error?.message || 'Timeout failed';
      logger.warn(`Auto timeout after ${totalCount} warnings failed for ${member.id} in ${guild.id}: ${timeoutError}`);
    }
  }

  return { id, totalCount, reason: finalReason, timeoutMs, timeoutApplied, timeoutError };
}

/** The automatic timeout line for a result of `issueWarning`, or null when the warning triggered none. */
export function warningPunishment(result) {
  if (!result.timeoutMs) return null;
  const duration = formatDurationMs(result.timeoutMs);
  return result.timeoutApplied
    ? `⏳ Timeout ${duration} (ends <t:${Math.floor((Date.now() + result.timeoutMs) / 1000)}:R>)`
    : `❌ Timeout ${duration} failed: ${result.timeoutError}`;
}

/** The ⚠️ WARNING ISSUED card for a result of `issueWarning`. */
export function warningCard({ userId, moderatorId, result, extra }) {
  const punishment = warningPunishment(result);
  return moderationCard({
    emoji: '⚠️',
    title: 'WARNING ISSUED',
    fields: [
      ['User', `<@${userId}>`],
      ['Reason', result.reason],
      ['Warnings', `${result.totalCount}/${getNextTimeoutThreshold(result.totalCount)}`],
      ['Punishment', punishment],
    ],
    moderatorId,
  }, extra);
}
