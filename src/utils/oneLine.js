// oneLine.js — short single-line command replies (`⏳ @user Has Been Timed Out, Reason: spam`).

const DEFAULT_REASONS = new Set(['No reason provided', 'No reason provided.', 'لم يتم تحديد سبب', 'Timeout removed by moderator', 'Mass ban - No reason provided', 'Mass kick - No reason provided']);

/** Mentions render as names but never ping anyone. */
export const NO_PINGS = Object.freeze({ parse: [] });

/** Collapse whitespace/new lines so the reply always stays on one line. */
export function toOneLine(text) {
  return String(text ?? '').replace(/\s*\n+\s*/gu, ' ').replace(/\s{2,}/gu, ' ').trim();
}

/** Append `, Reason: …` only when a real reason was given. */
export function withReason(text, reason) {
  const value = toOneLine(reason);
  return value && !DEFAULT_REASONS.has(value) ? `${text}, Reason: ${value}` : text;
}

/** Message payload for a one-line reply; clears any embed/buttons from a deferred reply. */
export function oneLine(emoji, text, extra = {}) {
  return { content: toOneLine(`${emoji} ${text}`), embeds: [], components: [], allowedMentions: NO_PINGS, ...extra };
}
