import { loadJourneyConfig } from './berryRpg.js';

const journeyKey = guildId => 'berry:journeys:' + guildId;
const sailingPostCleanupKey = guildId => 'berry:sailing-post-cleanup:' + guildId;
const ARRIVAL_POST_RETENTION_MS = 3 * 60 * 1000;
const processingGuilds = new Set();

export async function getJourneys(client, guildId) {
  const value = await client.db.get(journeyKey(guildId), {});
  return value && typeof value === 'object' ? value : {};
}

export async function saveJourneys(client, guildId, journeys) {
  return client.db.set(journeyKey(guildId), journeys);
}

async function scheduleSailingPostDeletion(client, guildId, channelId, deleteAt) {
  if (!channelId) return;
  const key = sailingPostCleanupKey(guildId);
  const entries = await client.db.get(key, []);
  const cleanup = Array.isArray(entries) ? entries : [];
  if (cleanup.some(entry => entry.channelId === channelId)) return;
  cleanup.push({ channelId, deleteAt });
  await client.db.set(key, cleanup);
}

async function processSailingPostDeletions(client, guildId, now) {
  const key = sailingPostCleanupKey(guildId);
  const entries = await client.db.get(key, []);
  if (!Array.isArray(entries) || entries.length === 0) return;

  let changed = false;
  const remaining = [];
  for (const entry of entries) {
    if (!entry?.channelId || Number(entry.deleteAt) > now) {
      if (entry?.channelId) remaining.push(entry);
      else changed = true;
      continue;
    }

    const channel = await client.channels.fetch(entry.channelId).catch(() => null);
    if (!channel) {
      changed = true;
      continue;
    }
    if (channel.guildId !== guildId || !channel.isThread?.()) {
      changed = true;
      continue;
    }

    const deleted = await channel.delete('Sailing Seas post expired three minutes after arrival')
      .then(() => true)
      .catch(() => false);
    changed = true;
    if (!deleted) remaining.push({ ...entry, deleteAt: now + 60000 });
  }

  if (changed) await client.db.set(key, remaining);
}

export async function processJourneys(client, guildId, onlyUserId = null) {
  if (processingGuilds.has(guildId)) return getJourneys(client, guildId);
  processingGuilds.add(guildId);
  try {
    const now = Date.now();
    await processSailingPostDeletions(client, guildId, now);
    const journeys = await getJourneys(client, guildId);
    const travelConfig = await loadJourneyConfig(client, guildId);
    let changed = false;

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
          const message = '🚢 **' + journey.from + ' → ' + journey.to + '** — **' + lastProgress + '%** complete.';
          await channel.send({ content: message, allowedMentions: { users: [userId], parse: [] } }).catch(() => {});
        }
        changed = true;
        if (lastProgress === 100) {
          if (journey.sailingPostId) {
            await scheduleSailingPostDeletion(client, guildId, journey.sailingPostId, Date.now() + ARRIVAL_POST_RETENTION_MS);
          }
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
