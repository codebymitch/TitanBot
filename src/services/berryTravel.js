import { adjustBerries, loadJourneyConfig, randomJourneyEvent } from './berryRpg.js';
import { formatCurrency } from '../utils/economy.js';

const journeyKey = guildId => 'berry:journeys:' + guildId;
const processingGuilds = new Set();

export async function getJourneys(client, guildId) {
  const value = await client.db.get(journeyKey(guildId), {});
  return value && typeof value === 'object' ? value : {};
}

export async function saveJourneys(client, guildId, journeys) {
  return client.db.set(journeyKey(guildId), journeys);
}

export async function processJourneys(client, guildId, onlyUserId = null) {
  if (processingGuilds.has(guildId)) return getJourneys(client, guildId);
  processingGuilds.add(guildId);
  try {
    const journeys = await getJourneys(client, guildId);
    const travelConfig = await loadJourneyConfig(client, guildId);
    let changed = false;
    const now = Date.now();

    for (const [userId, journey] of Object.entries(journeys)) {
      if (onlyUserId && userId !== onlyUserId) continue;
      if (journey.status === 'stalled') {
        journey.status = 'traveling';
        delete journey.stalledAt;
        changed = true;
      }
      if (journey.status !== 'traveling') continue;
      const duration = Math.min(180000, Math.max(15000, Number(journey.durationMs) || Number(journey.durationMinutes || travelConfig.durationMinutes) * 60000));
      const progress = Math.min(100, Math.floor(((now - journey.startedAt) / duration) * 4) * 25);
      let lastProgress = Number(journey.progress || 0);

      while (lastProgress < progress) {
        lastProgress += 25;
        journey.progress = lastProgress;
        const channel = await client.channels.fetch(journey.channelId).catch(() => null);
        if (channel?.isTextBased()) {
          let description = lastProgress === 100
            ? '🏝️ <@' + userId + '> has arrived at **' + journey.to + '**. The journey is complete.'
            : '🚢 <@' + userId + '> reached **' + lastProgress + '%** of the trip from **' + journey.from + '** to **' + journey.to + '**.';
          if (lastProgress < 100 && Math.random() < 0.45) {
            const event = randomJourneyEvent();
            description += '\n' + event;
            if (event.startsWith('⛈️')) {
              description += ' The crew braces for the waves and keeps moving.';
            } else if (event.startsWith('🪢')) {
              description += ' The crew makes quick repairs and continues.';
            } else if (event.startsWith('💰')) {
              const reward = Math.floor(Math.random() * 41) + 10;
              await adjustBerries(client, guildId, userId, reward).catch(() => {});
              description += ' The crew gains ' + formatCurrency(reward) + '.';
            }
          }
          await channel.send({ content: description, allowedMentions: { users: [userId], parse: [] } }).catch(() => {});
        }
        changed = true;
        if (lastProgress === 100) {
          delete journeys[userId];
          break;
        }
      }
    }

    if (changed) await saveJourneys(client, guildId, journeys);
    return journeys;
  } finally {
    processingGuilds.delete(guildId);
  }
}

export async function processAllJourneys(client) {
  for (const guild of client.guilds.cache.values()) {
    await processJourneys(client, guild.id).catch(() => {});
  }
}

export function getJourneyProgress(journey) {
  if (journey.status !== 'traveling') return Number(journey.progress || 0);
  const duration = Math.min(180000, Math.max(15000, Number(journey.durationMs) || Number(journey.durationMinutes || 3) * 60000));
  return Math.min(100, Math.floor(((Date.now() - journey.startedAt) / duration) * 4) * 25);
}

export { journeyKey };
