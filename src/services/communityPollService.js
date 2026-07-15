import { createEmbed } from '../utils/embeds.js';
import { logger } from '../utils/logger.js';
import { logEvent, EVENT_TYPES } from './loggingService.js';

const timers = new Map();
const pollKey = (guildId, id) => `community:${guildId}:poll:${id}`;

export async function closePoll(client, guildId, id) {
  const key = pollKey(guildId, id);
  const poll = await client.db.get(key);
  if (!poll || poll.status !== 'open') return false;
  poll.status = 'closed'; poll.closedAt = Date.now();
  await client.db.set(key, poll);
  const guild = client.guilds.cache.get(guildId);
  const channel = guild?.channels.cache.get(poll.channelId) || await guild?.channels.fetch(poll.channelId).catch(() => null);
  const message = channel?.isTextBased() ? await channel.messages.fetch(poll.messageId).catch(() => null) : null;
  if (poll.nativePoll && message?.poll && !message.poll.resultsFinalized) await message.poll.end().catch(() => null);
  const totals = poll.nativePoll && message?.poll
    ? [...message.poll.answers.values()].map(answer => answer.voteCount || 0)
    : poll.options.map((_, index) => Object.values(poll.votes || {}).filter(value => (Array.isArray(value) ? value : [value]).includes(index)).length);
  if (message) await message.edit({ embeds: [createEmbed({ title: `📊 תוצאות סופיות — ${poll.question}`, description: poll.options.map((option, index) => `**${index + 1}. ${option}** — ${totals[index]} קולות`).join('\n'), color: 'success', footer: { text: `סקר #${id} הסתיים` } })], components: [] });
  await logEvent({ client, guildId, eventType: EVENT_TYPES.SETTINGS_CHANGE, data: { title: `סקר #${id} נסגר`, description: `התקבלו ${totals.reduce((sum, value) => sum + value, 0)} בחירות.` } });
  timers.delete(key); return true;
}

export function schedulePollClosure(client, guildId, id, closesAt) {
  const key = pollKey(guildId, id);
  if (timers.has(key)) clearTimeout(timers.get(key));
  const delay = Math.max(0, Number(closesAt) - Date.now());
  timers.set(key, setTimeout(() => closePoll(client, guildId, id).catch(error => logger.error('Failed to close community poll', { guildId, id, error })), Math.min(delay, 2_147_000_000)));
}

export async function resumeCommunityPolls(client) {
  const keys = await client.db.list('community:');
  for (const key of keys.filter(value => /^community:[^:]+:poll:[^:]+$/.test(value))) {
    const poll = await client.db.get(key);
    if (!poll || poll.status !== 'open') continue;
    const [, guildId, , id] = key.split(':');
    schedulePollClosure(client, guildId, id, poll.closesAt);
  }
}
