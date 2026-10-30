// moderationCard.js — the shared reply card every moderation command uses:
//
// ⚠️ **WARNING ISSUED**
//
// **User:** @member
// **Reason:** Spam
// **Warnings:** 3/3
// ━━━━━━━━━━━━━━━━━━
// **Moderator:** @moderator
// **Time:** <t:…:R>

import { NO_PINGS, toOneLine } from './oneLine.js';

export const CARD_DIVIDER = '━━━━━━━━━━━━━━━━━━';
export const NO_REASON = 'لم يتم تحديد سبب';

// Defaults some commands used to fill in when no reason was typed; they all mean "no reason given".
const DEFAULT_REASONS = new Set([
  'No reason provided',
  'No reason provided.',
  'Timeout removed by moderator',
  'Mass ban - No reason provided',
  'Mass kick - No reason provided',
  NO_REASON,
]);

/** A real reason, or the Arabic "no reason given" text when none was written. */
export function cardReason(reason) {
  const value = toOneLine(reason);
  return value && !DEFAULT_REASONS.has(value) ? value : NO_REASON;
}

/** `15m`, `2h`, `1d`, `1w` — the largest unit that divides the duration evenly. */
export function formatDurationMs(durationMs) {
  const minutes = Math.round(durationMs / 60_000);
  if (minutes > 0 && minutes % 10080 === 0) return `${minutes / 10080}w`;
  if (minutes > 0 && minutes % 1440 === 0) return `${minutes / 1440}d`;
  if (minutes > 0 && minutes % 60 === 0) return `${minutes / 60}h`;
  return `${minutes}m`;
}

/**
 * Card text. `fields` is a list of `[label, value]` shown above the divider (empty values are skipped);
 * the moderator and time always sit under it.
 */
export function moderationCardText({ emoji, title, fields = [], moderatorId, timestamp = Date.now() }) {
  const lines = [`${emoji} **${title}**`, ''];
  for (const [label, value] of fields) {
    if (value === undefined || value === null || value === '') continue;
    lines.push(`**${label}:** ${value}`);
  }
  lines.push(CARD_DIVIDER);
  if (moderatorId) lines.push(`**Moderator:** <@${moderatorId}>`);
  lines.push(`**Time:** <t:${Math.floor(timestamp / 1000)}:R>`);
  return lines.join('\n');
}

/** Message payload for a card; clears any embed/buttons left on a deferred reply and never pings. */
export function moderationCard(card, extra = {}) {
  return { content: moderationCardText(card), embeds: [], components: [], allowedMentions: NO_PINGS, ...extra };
}
