import { ActivityType } from 'discord.js';

export const MIRROR_USER_ID = '1127099544560205914';

const ONLINE_STATUS_TEXT = 'Forgetting me was your greatest fortune';

export function applyPresence(client, status, activities) {
  if (status === 'offline' || status === 'invisible' || !status) {
    client.user.setPresence({
      status: 'idle',
      activities: [{ name: '💤 itay100k is sleeping', type: ActivityType.Playing }],
    });
    return;
  }

  client.user.setPresence({
    status,
    activities: [{ name: ONLINE_STATUS_TEXT, type: ActivityType.Playing }],
  });
}

export function syncFromGuild(client) {
  for (const guild of client.guilds.cache.values()) {
    const presence = guild.presences.cache.get(MIRROR_USER_ID);
    if (presence) {
      if (presence.status !== 'offline') client._mirrorLastSeen = Date.now();
      applyPresence(client, presence.status, presence.activities);
      return;
    }
  }
  // Not in any presence cache — user likely went offline
  // Only set sleeping if we previously confirmed them online (avoids false alarms on startup)
  if (client._mirrorLastSeen && Date.now() - client._mirrorLastSeen > 2 * 60 * 1000) {
    applyPresence(client, 'offline', []);
  }
}
