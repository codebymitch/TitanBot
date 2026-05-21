import { ActivityType } from 'discord.js';

export const MIRROR_USER_ID = '1127099544560205914';

const ONLINE_STATUSES = [
  "Don't worry…",
  "I'll watch over your path,",
  "no matter the cost ♭",
];

let _rotationInterval = null;
let _rotationIndex = 0;
let _currentStatus = null;

export function applyPresence(client, status, activities) {
  if (status === 'offline' || status === 'invisible' || !status) {
    if (_rotationInterval) {
      clearInterval(_rotationInterval);
      _rotationInterval = null;
    }
    _currentStatus = null;
    client.user.setPresence({
      status: 'idle',
      activities: [{ name: '💤 itay100k is sleeping', type: ActivityType.Playing }],
    });
    return;
  }

  _currentStatus = status;

  // Rotation already running — just sync the status dot if it changed
  if (_rotationInterval) {
    client.user.setPresence({
      status,
      activities: [{ name: ONLINE_STATUSES[_rotationIndex], type: ActivityType.Playing }],
    });
    return;
  }

  // Start fresh rotation from the first line
  _rotationIndex = 0;
  client.user.setPresence({
    status,
    activities: [{ name: ONLINE_STATUSES[0], type: ActivityType.Playing }],
  });

  _rotationInterval = setInterval(() => {
    _rotationIndex = (_rotationIndex + 1) % ONLINE_STATUSES.length;
    if (_currentStatus) {
      client.user.setPresence({
        status: _currentStatus,
        activities: [{ name: ONLINE_STATUSES[_rotationIndex], type: ActivityType.Playing }],
      });
    }
  }, 40_000);
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
